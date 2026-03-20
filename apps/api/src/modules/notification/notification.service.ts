import { Injectable, Logger } from '@nestjs/common';
import type { SlackIntegrationConfig, WebhookIntegrationConfig } from '@approva/shared';
import { RequestContextService } from '../../common/observability/request-context.service';
import { EmailService } from '../email/email.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { SlackService } from '../slack/slack.service';
import { WebhookService } from '../webhook/webhook.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly slackService: SlackService,
    private readonly webhookService: WebhookService,
    private readonly integrationsService: IntegrationsService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async notifyPendingApproval(input: {
    organizationId: string;
    approvalRequestId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    reason: string;
    riskLevel: string;
    approvalUrl: string;
    consoleUrl: string;
    requestedBy?: string;
  }) {
    this.requestContextService.setContext({
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
    });
    const integrations = await this.loadNotificationIntegrations(input.organizationId);
    const recipients = this.getApprovalNotificationRecipients(integrations.email?.recipients);

    if (recipients.length === 0) {
      this.logger.debug(
        `Approval notification email skipped for ${input.approvalRequestId}: no email recipients configured for this organization.`,
      );
    } else {
      try {
        const receipt = await this.emailService.sendApprovalNotification({
          to: recipients,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          reason: input.reason,
          riskLevel: input.riskLevel,
          approvalUrl: input.approvalUrl,
          requestedBy: input.requestedBy,
        });

        this.logger.log(
          `Approval notification email sent for ${input.approvalRequestId} via ${receipt.provider}.`,
        );
      } catch (error) {
        this.logger.error(
          `Approval notification email failed for ${input.approvalRequestId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    try {
      const receipt = await this.slackService.sendApprovalRequested({
        approvalRequestId: input.approvalRequestId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        reason: input.reason,
        riskLevel: input.riskLevel,
        approvalUrl: input.approvalUrl,
        consoleUrl: input.consoleUrl,
        requestedBy: input.requestedBy ?? 'unknown',
      }, integrations.slack);

      this.logger.log(
        `Approval notification Slack message sent for ${input.approvalRequestId} via ${receipt.provider}.`,
      );
    } catch (error) {
      this.logger.error(
        `Approval notification Slack delivery failed for ${input.approvalRequestId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    await this.notifyIntegrationWebhook(
      'approval_request.pending',
      input.organizationId,
      integrations.webhook,
      input,
    );
  }

  async notifyApprovalOutcome(input: {
    organizationId: string;
    approvalRequestId: string;
    outcome: 'approved' | 'rejected' | 'expired';
    action: string;
    resourceType: string;
    resourceId: string;
    riskLevel: string;
    reason: string;
    approvalUrl: string;
    consoleUrl: string;
    requestedBy?: string;
    approver?: string | null;
  }) {
    this.requestContextService.setContext({
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
    });
    const integrations = await this.loadNotificationIntegrations(input.organizationId);

    try {
      const method =
        input.outcome === 'approved'
          ? this.slackService.sendApprovalApproved.bind(this.slackService)
          : input.outcome === 'rejected'
            ? this.slackService.sendApprovalRejected.bind(this.slackService)
            : this.slackService.sendApprovalExpired.bind(this.slackService);

      const receipt = await method({
        approvalRequestId: input.approvalRequestId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        riskLevel: input.riskLevel,
        reason: input.reason,
        requestedBy: input.requestedBy ?? 'unknown',
        approvalUrl: input.approvalUrl,
        consoleUrl: input.consoleUrl,
        approver: input.approver ?? null,
      }, integrations.slack);

      this.logger.log(
        `Approval outcome Slack message sent for ${input.approvalRequestId} via ${receipt.provider}.`,
      );
    } catch (error) {
      this.logger.error(
        `Approval outcome Slack delivery failed for ${input.approvalRequestId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    await this.notifyIntegrationWebhook(
      `approval_request.${input.outcome}`,
      input.organizationId,
      integrations.webhook,
      input,
    );
  }

  private getApprovalNotificationRecipients(configuredRecipients?: string[]) {
    if (configuredRecipients && configuredRecipients.length > 0) {
      return configuredRecipients;
    }

    const raw =
      process.env.APPROVA_APPROVAL_NOTIFICATION_TO ??
      process.env.AUTHON_APPROVAL_NOTIFICATION_TO ??
      '';

    return raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private async loadNotificationIntegrations(organizationId: string) {
    try {
      return await this.integrationsService.getNotificationIntegrations(organizationId);
    } catch (error) {
      this.logger.error(
        `Failed to load notification integrations for ${organizationId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      return {
        slack: null,
        webhook: null,
        email: null,
      };
    }
  }

  private async notifyIntegrationWebhook(
    eventType: string,
    organizationId: string,
    webhookConfig: WebhookIntegrationConfig | null,
    payload: Record<string, unknown>,
  ) {
    if (!webhookConfig) {
      return;
    }

    try {
      const receipt = await this.webhookService.deliverIntegrationWebhook({
        organizationId,
        url: webhookConfig.url,
        secret: webhookConfig.secret,
        approvalRequestId:
          typeof payload.approvalRequestId === 'string' ? payload.approvalRequestId : 'unknown',
        eventType,
        payload,
      });

      if (!receipt.ok) {
        this.logger.warn(
          `Integration webhook delivery failed for ${eventType} with status ${receipt.status}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Integration webhook delivery failed for ${eventType}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
