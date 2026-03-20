import { Injectable, Logger } from '@nestjs/common';
import type { SlackIntegrationConfig } from '@approva/shared';
import { WebClient } from '@slack/web-api';

type SlackApprovalNotificationType =
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_expired';

interface SlackDeliveryReceipt {
  provider: 'slack' | 'console';
  channel?: string | null;
  ts?: string | null;
}

interface SlackApprovalNotificationInput {
  approvalRequestId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  riskLevel: string;
  reason: string;
  requestedBy: string;
  approvalUrl: string;
  consoleUrl: string;
  approver?: string | null;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  async sendApprovalRequested(
    input: SlackApprovalNotificationInput,
    config?: SlackIntegrationConfig | null,
  ): Promise<SlackDeliveryReceipt> {
    return this.sendApprovalNotification('approval_requested', input, config);
  }

  async sendApprovalApproved(
    input: SlackApprovalNotificationInput,
    config?: SlackIntegrationConfig | null,
  ): Promise<SlackDeliveryReceipt> {
    return this.sendApprovalNotification('approval_approved', input, config);
  }

  async sendApprovalRejected(
    input: SlackApprovalNotificationInput,
    config?: SlackIntegrationConfig | null,
  ): Promise<SlackDeliveryReceipt> {
    return this.sendApprovalNotification('approval_rejected', input, config);
  }

  async sendApprovalExpired(
    input: SlackApprovalNotificationInput,
    config?: SlackIntegrationConfig | null,
  ): Promise<SlackDeliveryReceipt> {
    return this.sendApprovalNotification('approval_expired', input, config);
  }

  private async sendApprovalNotification(
    type: SlackApprovalNotificationType,
    input: SlackApprovalNotificationInput,
    config?: SlackIntegrationConfig | null,
  ): Promise<SlackDeliveryReceipt> {
    const botToken = config?.botToken?.trim() || this.getBotToken();
    const channelId = config?.channelId?.trim() || this.getChannelId();
    const client = botToken ? new WebClient(botToken) : null;

    if (!client || !channelId) {
      this.logger.log(this.buildConsoleFallback(type, input));
      return {
        provider: 'console',
        channel: channelId,
        ts: null,
      };
    }

    const response = await client.chat.postMessage({
      channel: channelId,
      text: this.buildPlainText(type, input),
      blocks: this.buildBlocks(type, input),
      unfurl_links: false,
      unfurl_media: false,
    });

    return {
      provider: 'slack',
      channel: response.channel ?? channelId,
      ts: response.ts ?? null,
    };
  }

  private buildBlocks(
    type: SlackApprovalNotificationType,
    input: SlackApprovalNotificationInput,
  ) {
    const statusCopy = this.getStatusCopy(type);

    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: statusCopy.title,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusCopy.body}\n\n<${input.approvalUrl}|Open approval page> · <${input.consoleUrl}|Open console detail>`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Action*\n${input.action}`,
          },
          {
            type: 'mrkdwn',
            text: `*Resource*\n${input.resourceType}/${input.resourceId}`,
          },
          {
            type: 'mrkdwn',
            text: `*Risk level*\n${input.riskLevel}`,
          },
          {
            type: 'mrkdwn',
            text: `*Requested by*\n${input.requestedBy}`,
          },
          {
            type: 'mrkdwn',
            text: `*Reason*\n${input.reason}`,
          },
          ...(input.approver
            ? [
                {
                  type: 'mrkdwn',
                  text: `*Approver*\n${input.approver}`,
                },
              ]
            : []),
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text:
              'Slack is a notification channel only. Approval still happens in Approva using the secure approval page and passkey authentication.',
          },
        ],
      },
    ];
  }

  private buildPlainText(
    type: SlackApprovalNotificationType,
    input: SlackApprovalNotificationInput,
  ) {
    const statusCopy = this.getStatusCopy(type);

    return (
      `${statusCopy.title}\n\n` +
      `${statusCopy.body}\n` +
      `Action: ${input.action}\n` +
      `Resource: ${input.resourceType}/${input.resourceId}\n` +
      `Risk level: ${input.riskLevel}\n` +
      `Requested by: ${input.requestedBy}\n` +
      `Reason: ${input.reason}\n` +
      (input.approver ? `Approver: ${input.approver}\n` : '') +
      `Approval page: ${input.approvalUrl}\n` +
      `Console detail: ${input.consoleUrl}\n`
    );
  }

  private buildConsoleFallback(
    type: SlackApprovalNotificationType,
    input: SlackApprovalNotificationInput,
  ) {
    const channelId = this.getChannelId() ?? 'not-configured';
    const redactedApprovalUrl = this.redactApprovalUrl(input.approvalUrl);

    return (
      `[Approva Slack][console fallback][${type}] channel=${channelId}\n` +
      `${this.getStatusCopy(type).title}\n\n` +
      `Action: ${input.action}\n` +
      `Resource: ${input.resourceType}/${input.resourceId}\n` +
      `Risk level: ${input.riskLevel}\n` +
      `Requested by: ${input.requestedBy}\n` +
      `Reason: ${input.reason}\n` +
      (input.approver ? `Approver: ${input.approver}\n` : '') +
      `Approval page: ${redactedApprovalUrl}\n` +
      `Console detail: ${input.consoleUrl}\n`
    );
  }

  private getStatusCopy(type: SlackApprovalNotificationType) {
    switch (type) {
      case 'approval_requested':
        return {
          title: 'Approval required',
          body: 'A risky action has paused and is waiting for a human decision.',
        };
      case 'approval_approved':
        return {
          title: 'Approval granted',
          body: 'The request was approved in Approva and execution can continue with the scoped capability.',
        };
      case 'approval_rejected':
        return {
          title: 'Approval rejected',
          body: 'The request was rejected in Approva and should not proceed.',
        };
      case 'approval_expired':
        return {
          title: 'Approval expired',
          body: 'The request expired in Approva before a decision was recorded.',
        };
    }
  }

  private getBotToken() {
    return process.env.APPROVA_SLACK_BOT_TOKEN ?? process.env.AUTHON_SLACK_BOT_TOKEN ?? undefined;
  }

  private getChannelId() {
    return process.env.APPROVA_SLACK_CHANNEL_ID ?? process.env.AUTHON_SLACK_CHANNEL_ID ?? undefined;
  }

  private redactApprovalUrl(value: string) {
    try {
      const url = new URL(value);
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return 'redacted';
    }
  }
}
