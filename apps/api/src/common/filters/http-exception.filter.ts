import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestContext } from '../observability/request-context';
import { captureExceptionForObservability } from '../observability/sentry.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestContext = getRequestContext();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: string | string[] } | null)?.message ??
          (exception instanceof Error ? exception.message : 'Unexpected error');

    const details =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : undefined;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      captureExceptionForObservability(exception);
    }

    if (requestContext?.requestId) {
      response.setHeader('x-request-id', requestContext.requestId);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: this.normalizePath(request.originalUrl ?? request.url),
      requestId: requestContext?.requestId ?? null,
      error: {
        code:
          exception instanceof BadRequestException
            ? 'VALIDATION_ERROR'
            : exception instanceof HttpException
              ? exception.name
              : 'INTERNAL_SERVER_ERROR',
        message,
        details,
      },
    });
  }

  private normalizePath(url: string) {
    const [pathname] = url.split('?');
    return pathname || '/';
  }
}
