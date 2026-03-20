import type { NextFunction, Request, Response } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { getRequestContext } from '../../common/observability/request-context';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async use(request: Request, response: Response, next: NextFunction) {
    if (!this.rateLimitService.isEnabled() || request.method === 'OPTIONS') {
      next();
      return;
    }

    const pathname = this.normalizePath(request.originalUrl ?? request.url);

    if (!pathname.startsWith('/v1')) {
      next();
      return;
    }

    const policy = this.resolvePolicy(request, pathname);
    const decision = await this.rateLimitService.consume(policy);

    this.applyHeaders(response, decision.limit, decision.remaining, decision.retryAfterSeconds, decision.windowSeconds);

    if (decision.allowed) {
      next();
      return;
    }

    response.setHeader('Retry-After', String(decision.retryAfterSeconds));
    response.status(429).json({
      statusCode: 429,
      timestamp: new Date().toISOString(),
      path: pathname,
      requestId: getRequestContext()?.requestId ?? null,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded for this API client.',
        details: {
          bucket: policy.bucket,
          scope: policy.scope,
          limit: decision.limit,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      },
    });
  }

  private resolvePolicy(request: Request, pathname: string) {
    if (pathname.startsWith('/v1/approval-requests')) {
      return {
        scope: `ip:${this.getClientIp(request)}`,
        bucket: 'approval-ip',
        limit: this.rateLimitService.getApprovalIpLimit(),
        windowMs: 60_000,
      };
    }

    const dashboardUserId =
      this.readHeader(request, 'x-approva-user-id') ??
      this.readHeader(request, 'x-authon-dashboard-user-id');

    if (dashboardUserId) {
      return {
        scope: `user:${dashboardUserId}`,
        bucket: 'authenticated-user',
        limit: this.rateLimitService.getAuthenticatedLimit(),
        windowMs: 60_000,
      };
    }

    return {
      scope: `ip:${this.getClientIp(request)}`,
      bucket: 'public-ip',
      limit: this.rateLimitService.getGlobalPublicLimit(),
      windowMs: 60_000,
    };
  }

  private applyHeaders(
    response: Response,
    limit: number,
    remaining: number,
    resetSeconds: number,
    windowSeconds: number,
  ) {
    const policy = `${limit};w=${windowSeconds}`;

    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(resetSeconds));
    response.setHeader('RateLimit-Policy', policy);

    // Retain the legacy X- headers for easier inspection during integrations and debugging.
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(resetSeconds));
  }

  private getClientIp(request: Request) {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private normalizePath(url: string) {
    const [pathname] = url.split('?');
    return pathname || '/';
  }

  private readHeader(request: Request, name: string) {
    const value = request.headers[name];

    if (Array.isArray(value)) {
      return value[0]?.trim() || null;
    }

    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
