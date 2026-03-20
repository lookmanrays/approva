import { Injectable, Logger } from '@nestjs/common';
import {
  buildApprovalNotificationEmail,
  createTransactionalEmailProvider,
  TransactionalEmailClient,
} from '@approva/email';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly client = new TransactionalEmailClient(
    createTransactionalEmailProvider({
      resendApiKey: this.getResendApiKey(),
      logger: (message) => this.logger.log(message),
    }),
  );

  constructor(private readonly metricsService: MetricsService) {}

  async sendApprovalNotification(input: {
    to: string[];
    action: string;
    resourceType: string;
    resourceId: string;
    reason: string;
    riskLevel: string;
    approvalUrl: string;
    requestedBy?: string;
  }) {
    const template = buildApprovalNotificationEmail(input);

    return this.sendWithMetrics({
      from: this.getFromAddress(),
      replyTo: this.getReplyToAddress(),
      to: input.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [
        {
          name: 'template',
          value: 'approval_notification',
        },
      ],
    });
  }

  private async sendWithMetrics(input: Parameters<TransactionalEmailClient['send']>[0]) {
    try {
      const receipt = await this.client.send(input);
      this.metricsService.increment('approva_email_deliveries_total');
      return receipt;
    } catch (error) {
      this.metricsService.increment('approva_email_failures_total');
      throw error;
    }
  }

  private getResendApiKey() {
    return (
      process.env.APPROVA_RESEND_API_KEY ??
      process.env.AUTHON_RESEND_API_KEY ??
      process.env.AUTH_RESEND_API_KEY ??
      undefined
    );
  }

  private getFromAddress() {
    return (
      process.env.APPROVA_EMAIL_FROM ??
      process.env.AUTHON_EMAIL_FROM ??
      process.env.AUTH_EMAIL_FROM ??
      'Approva <no-reply@approva.local>'
    );
  }

  private getReplyToAddress() {
    return process.env.APPROVA_EMAIL_REPLY_TO ?? process.env.AUTHON_EMAIL_REPLY_TO ?? undefined;
  }
}
