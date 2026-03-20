import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { RequestContextService } from '../../common/observability/request-context.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaDbClient } from '../../common/prisma/prisma.types';
import { signWebhookPayload } from '../../common/utils/hash.util';
import { MetricsService } from '../observability/metrics.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly metricsService: MetricsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async queueDecisionEvent(
    input: {
      organizationId: string;
      approvalRequestId: string;
      callbackUrl?: string | null;
      eventType: string;
    },
    prisma: PrismaDbClient = this.prisma,
  ) {
    if (!input.callbackUrl) {
      return null;
    }

    return prisma.webhookDelivery.upsert({
      where: {
        approvalRequestId_eventType: {
          approvalRequestId: input.approvalRequestId,
          eventType: input.eventType,
        },
      },
      update: {
        organizationId: input.organizationId,
        callbackUrl: input.callbackUrl,
      },
      create: {
        organizationId: input.organizationId,
        approvalRequestId: input.approvalRequestId,
        callbackUrl: input.callbackUrl,
        eventType: input.eventType,
        status: 'pending',
      },
    });
  }

  async deliverQueuedDelivery(
    deliveryId: string,
    payload: Record<string, unknown>,
  ) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: {
        id: deliveryId,
      },
    });

    if (!delivery || delivery.status === 'delivered') {
      return delivery;
    }

    this.requestContextService.setContext({
      organizationId: delivery.organizationId,
      approvalRequestId: delivery.approvalRequestId,
    });

    if (delivery.attemptCount > 0) {
      try {
        await this.rateLimitService.enforceOrganizationLimit({
          organizationId: delivery.organizationId,
          bucket: 'webhook-delivery-retry',
          limit: this.rateLimitService.getOrganizationWebhookRetryLimit(),
          message: 'Organization webhook retry rate limit exceeded.',
        });
      } catch (error) {
        this.metricsService.increment('approva_webhook_failures_total');
        this.logger.warn(
          `Webhook delivery ${delivery.id} skipped because the organization webhook retry limit was reached.`,
        );

        return this.prisma.webhookDelivery.update({
          where: {
            id: delivery.id,
          },
          data: {
            status: 'failed',
            lastAttemptAt: new Date(),
            responseStatus: 429,
            responseBody: error instanceof Error ? error.message : 'Webhook retry limit exceeded.',
          },
        });
      }
    }

    const replayBlocked = await this.rateLimitService.isWebhookReplayBlocked({
      organizationId: delivery.organizationId,
      target: `decision:${delivery.callbackUrl}`,
      eventType: delivery.eventType,
      approvalRequestId: delivery.approvalRequestId,
    });

    if (replayBlocked) {
      this.logger.warn(`Webhook delivery ${delivery.id} blocked by replay protection.`);
      return this.prisma.webhookDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: 'failed',
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: new Date(),
          responseStatus: 409,
          responseBody: 'Duplicate webhook event blocked by replay protection.',
        },
      });
    }

    try {
      const rawPayload = JSON.stringify({
        id: delivery.id,
        approvalRequestId: delivery.approvalRequestId,
        eventType: delivery.eventType,
        occurredAt: new Date().toISOString(),
        payload,
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signWebhookPayload({
        secret: this.getWebhookSigningSecret(),
        timestamp,
        payload: rawPayload,
      });

      const response = await fetch(delivery.callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-approval-signature': signature,
          'x-approval-timestamp': timestamp,
        },
        body: rawPayload,
      });

      const responseBody = this.summarizeResponseBody(await response.text(), response.ok);
      await this.prisma.webhookDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: response.ok ? 'delivered' : 'failed',
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: new Date(),
          responseStatus: response.status,
          responseBody,
        },
      });

      if (response.ok) {
        this.metricsService.increment('approva_webhook_deliveries_total');
        await this.rateLimitService.recordWebhookReplay({
          organizationId: delivery.organizationId,
          target: `decision:${delivery.callbackUrl}`,
          eventType: delivery.eventType,
          approvalRequestId: delivery.approvalRequestId,
        });
      }

      if (!response.ok) {
        this.metricsService.increment('approva_webhook_failures_total');
        this.logger.warn(`Webhook delivery ${delivery.id} failed with status ${response.status}. Retry is stubbed for MVP.`);
      }
    } catch (error) {
      this.metricsService.increment('approva_webhook_failures_total');
      await this.prisma.webhookDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: 'failed',
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: new Date(),
          responseBody: this.summarizeErrorMessage(error),
        },
      });

      this.logger.warn(`Webhook delivery ${delivery.id} failed. Retry is stubbed for MVP.`);
    }
  }

  async deliverDecisionEvent(input: {
    organizationId: string;
    approvalRequestId: string;
    callbackUrl?: string | null;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    const delivery = await this.queueDecisionEvent(input);

    if (!delivery) {
      return null;
    }

    await this.deliverQueuedDelivery(delivery.id, input.payload);

    return delivery;
  }

  async deliverIntegrationWebhook(input: {
    organizationId: string;
    url: string;
    secret?: string | null;
    approvalRequestId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    this.requestContextService.setContext({
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
    });
    const replayBlocked = await this.rateLimitService.isWebhookReplayBlocked({
      organizationId: input.organizationId,
      target: `integration:${input.url}`,
      eventType: input.eventType,
      approvalRequestId: input.approvalRequestId,
    });

    if (replayBlocked) {
      this.logger.warn(
        `Integration webhook for ${input.eventType} on ${input.approvalRequestId} was blocked by replay protection.`,
      );
      return {
        ok: false,
        status: 409,
        body: 'Duplicate webhook event blocked by replay protection.',
      };
    }

    const rawPayload = JSON.stringify({
      id: `integration:${input.eventType}:${input.approvalRequestId}`,
      approvalRequestId: input.approvalRequestId,
      eventType: input.eventType,
      occurredAt: new Date().toISOString(),
      payload: input.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhookPayload({
      secret: input.secret?.trim() || this.getWebhookSigningSecret(),
      timestamp,
      payload: rawPayload,
    });

    try {
      const response = await fetch(input.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-approval-signature': signature,
          'x-approval-timestamp': timestamp,
        },
        body: rawPayload,
      });

      if (response.ok) {
        this.metricsService.increment('approva_webhook_deliveries_total');
        await this.rateLimitService.recordWebhookReplay({
          organizationId: input.organizationId,
          target: `integration:${input.url}`,
          eventType: input.eventType,
          approvalRequestId: input.approvalRequestId,
        });
      }

      if (!response.ok) {
        this.metricsService.increment('approva_webhook_failures_total');
      }

      return {
        ok: response.ok,
        status: response.status,
        body: (await response.text()).slice(0, 2000),
      };
    } catch (error) {
      this.metricsService.increment('approva_webhook_failures_total');
      throw error;
    }
  }

  private getWebhookSigningSecret() {
    const secret = process.env.WEBHOOK_SIGNING_SECRET?.trim();

    if (!secret) {
      throw new InternalServerErrorException('WEBHOOK_SIGNING_SECRET is not configured.');
    }

    return secret;
  }

  private summarizeResponseBody(body: string, ok: boolean) {
    if (ok) {
      return null;
    }

    const normalized = body.replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return null;
    }

    return normalized.slice(0, 200);
  }

  private summarizeErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return 'Unknown webhook error';
    }

    const normalized = `${error.name}: ${error.message}`.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 200);
  }
}
