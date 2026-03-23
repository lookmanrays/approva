import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConsoleAuthService } from '../../modules/console-auth/console-auth.service';
import { RequestContextService } from './request-context.service';
import { StructuredLoggerService } from './structured-logger.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly logger: StructuredLoggerService,
    private readonly consoleAuthService: ConsoleAuthService,
  ) {}

  async use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();
    const consoleSession = await this.consoleAuthService.resolveSession(request);
    this.normalizeCompatibilityHeaders(request, consoleSession?.user.id ?? null);
    const requestId = this.readHeader(request, 'x-request-id') ?? randomUUID();
    const organizationId = this.readHeader(request, 'x-approva-organization-id');
    const userId = this.readHeader(request, 'x-approva-user-id');
    const initialPath = this.normalizePath(request.originalUrl ?? request.url);

    response.setHeader('x-request-id', requestId);

    this.requestContextService.run(
      {
        requestId,
        organizationId,
        approvalRequestId: null,
        userId,
        method: request.method,
        path: initialPath,
      },
      () => {
        response.on('finish', () => {
          this.logger.log(
            {
              event: 'request_completed',
              method: request.method,
              path: initialPath,
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
            },
            'HttpRequest',
          );
        });

        next();
      },
    );
  }

  private readHeader(request: Request, name: string) {
    const value = request.headers[name];

    if (Array.isArray(value)) {
      return value[0]?.trim() || null;
    }

    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private normalizeCompatibilityHeaders(request: Request, authenticatedUserId: string | null) {
    this.copyHeader(request, 'x-approva-organization-id', 'x-authon-organization-id');
    this.copyHeader(request, 'x-approva-organization-slug', 'x-authon-organization-slug');

    if (authenticatedUserId) {
      request.headers['x-approva-user-id'] = authenticatedUserId;
      return;
    }

    delete request.headers['x-approva-user-id'];
    delete request.headers['x-authon-dashboard-user-id'];
  }

  private copyHeader(request: Request, target: string, source: string) {
    const sourceValue = this.readHeader(request, source);
    const targetValue = this.readHeader(request, target);

    if (!targetValue && sourceValue) {
      request.headers[target] = sourceValue;
    }
  }

  private normalizePath(url: string) {
    const [pathname] = url.split('?');
    return pathname || '/';
  }
}
