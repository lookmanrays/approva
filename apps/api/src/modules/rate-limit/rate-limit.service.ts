import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashCanonicalValue } from '../../common/utils/hash.util';

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  windowSeconds: number;
}

@Injectable()
export class RateLimitService {
  private lastCleanupAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  isEnabled() {
    return this.readBooleanEnv('APPROVA_RATE_LIMIT_ENABLED', 'AUTHON_RATE_LIMIT_ENABLED', true);
  }

  getGlobalPublicLimit() {
    return this.readNumberEnv('APPROVA_RATE_LIMIT_GLOBAL', 'AUTHON_RATE_LIMIT_GLOBAL', 60);
  }

  getAuthenticatedLimit() {
    return this.readNumberEnv(
      'APPROVA_RATE_LIMIT_AUTHENTICATED',
      'AUTHON_RATE_LIMIT_AUTHENTICATED',
      300,
    );
  }

  getApprovalIpLimit() {
    return this.readNumberEnv('APPROVA_RATE_LIMIT_APPROVAL', 'AUTHON_RATE_LIMIT_APPROVAL', 20);
  }

  getOrganizationApprovalCreateLimit() {
    return this.readNumberEnv(
      'APPROVA_RATE_LIMIT_ORG_APPROVAL_CREATION',
      'AUTHON_RATE_LIMIT_ORG_APPROVAL_CREATION',
      120,
    );
  }

  getOrganizationCapabilityVerificationLimit() {
    return this.readNumberEnv(
      'APPROVA_RATE_LIMIT_ORG_CAPABILITY_VERIFICATION',
      'AUTHON_RATE_LIMIT_ORG_CAPABILITY_VERIFICATION',
      600,
    );
  }

  getOrganizationWebhookRetryLimit() {
    return this.readNumberEnv(
      'APPROVA_RATE_LIMIT_ORG_WEBHOOK_RETRIES',
      'AUTHON_RATE_LIMIT_ORG_WEBHOOK_RETRIES',
      120,
    );
  }

  getWebhookReplayWindowMs() {
    return this.readNumberEnv(
      'APPROVA_WEBHOOK_REPLAY_WINDOW_SECONDS',
      'AUTHON_WEBHOOK_REPLAY_WINDOW_SECONDS',
      300,
    ) * 1000;
  }

  async consume(input: {
    scope: string;
    bucket: string;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitDecision> {
    if (!this.isEnabled()) {
      return this.buildUnlimitedDecision(input.limit, input.windowMs);
    }

    this.maybeCleanupExpiredRecords();

    const now = Date.now();
    const windowStartMs = now - (now % input.windowMs);
    const windowStart = new Date(windowStartMs);
    const resetAt = new Date(windowStartMs + input.windowMs);

    const record = await this.prisma.rateLimitWindow.upsert({
      where: {
        scope_bucket_windowStart: {
          scope: input.scope,
          bucket: input.bucket,
          windowStart,
        },
      },
      update: {
        count: {
          increment: 1,
        },
        expiresAt: resetAt,
      },
      create: {
        scope: input.scope,
        bucket: input.bucket,
        windowStart,
        count: 1,
        expiresAt: resetAt,
      },
    });

    return {
      allowed: record.count <= input.limit,
      count: record.count,
      limit: input.limit,
      remaining: Math.max(input.limit - record.count, 0),
      resetAt,
      retryAfterSeconds: this.toRetryAfterSeconds(resetAt),
      windowSeconds: Math.max(Math.floor(input.windowMs / 1000), 1),
    };
  }

  async enforceOrganizationLimit(input: {
    organizationId: string;
    bucket: string;
    limit: number;
    message: string;
    windowMs?: number;
  }) {
    const decision = await this.consume({
      scope: `org:${input.organizationId}`,
      bucket: input.bucket,
      limit: input.limit,
      windowMs: input.windowMs ?? 60_000,
    });

    if (decision.allowed) {
      return decision;
    }

    throw new HttpException({
      code: 'RATE_LIMIT_EXCEEDED',
      message: input.message,
      details: {
        bucket: input.bucket,
        limit: decision.limit,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    }, HttpStatus.TOO_MANY_REQUESTS);
  }

  async isWebhookReplayBlocked(input: {
    organizationId: string;
    target: string;
    eventType: string;
    approvalRequestId?: string | null;
  }) {
    if (!this.isEnabled()) {
      return false;
    }

    this.maybeCleanupExpiredRecords();

    const replayKey = this.buildWebhookReplayKey(input);
    const existing = await this.prisma.webhookReplayWindow.findUnique({
      where: {
        organizationId_target_replayKey: {
          organizationId: input.organizationId,
          target: input.target,
          replayKey,
        },
      },
      select: {
        expiresAt: true,
      },
    });

    return Boolean(existing && existing.expiresAt.getTime() > Date.now());
  }

  async recordWebhookReplay(input: {
    organizationId: string;
    target: string;
    eventType: string;
    approvalRequestId?: string | null;
  }) {
    if (!this.isEnabled()) {
      return;
    }

    const expiresAt = new Date(Date.now() + this.getWebhookReplayWindowMs());
    const replayKey = this.buildWebhookReplayKey(input);

    await this.prisma.webhookReplayWindow.upsert({
      where: {
        organizationId_target_replayKey: {
          organizationId: input.organizationId,
          target: input.target,
          replayKey,
        },
      },
      update: {
        eventType: input.eventType,
        approvalRequestId: input.approvalRequestId ?? null,
        expiresAt,
      },
      create: {
        organizationId: input.organizationId,
        target: input.target,
        replayKey,
        eventType: input.eventType,
        approvalRequestId: input.approvalRequestId ?? null,
        expiresAt,
      },
    });
  }

  private buildWebhookReplayKey(input: {
    eventType: string;
    approvalRequestId?: string | null;
  }) {
    return hashCanonicalValue({
      eventType: input.eventType,
      approvalRequestId: input.approvalRequestId ?? null,
    });
  }

  private buildUnlimitedDecision(limit: number, windowMs: number): RateLimitDecision {
    const resetAt = new Date(Date.now() + windowMs);

    return {
      allowed: true,
      count: 0,
      limit,
      remaining: limit,
      resetAt,
      retryAfterSeconds: this.toRetryAfterSeconds(resetAt),
      windowSeconds: Math.max(Math.floor(windowMs / 1000), 1),
    };
  }

  private maybeCleanupExpiredRecords() {
    const now = Date.now();

    if (now - this.lastCleanupAt < 60_000) {
      return;
    }

    this.lastCleanupAt = now;
    const expiredBefore = new Date(now);

    void this.prisma.rateLimitWindow.deleteMany({
      where: {
        expiresAt: {
          lt: expiredBefore,
        },
      },
    });

    void this.prisma.webhookReplayWindow.deleteMany({
      where: {
        expiresAt: {
          lt: expiredBefore,
        },
      },
    });
  }

  private toRetryAfterSeconds(resetAt: Date) {
    return Math.max(Math.ceil((resetAt.getTime() - Date.now()) / 1000), 1);
  }

  private readNumberEnv(name: string, legacyName: string, fallback: number) {
    const raw = (process.env[name] ?? process.env[legacyName])?.trim();

    if (!raw) {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private readBooleanEnv(name: string, legacyName: string, fallback: boolean) {
    const raw = (process.env[name] ?? process.env[legacyName])?.trim().toLowerCase();

    if (!raw) {
      return fallback;
    }

    if (raw === 'true') {
      return true;
    }

    if (raw === 'false') {
      return false;
    }

    return fallback;
  }
}
