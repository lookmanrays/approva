import {
  ConsoleLogger,
  Injectable,
  LoggerService,
} from '@nestjs/common';
import { getRequestContext } from './request-context';

@Injectable()
export class StructuredLoggerService extends ConsoleLogger implements LoggerService {
  override log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  override error(message: unknown, stack?: string, context?: string) {
    this.write('error', message, context, stack);
  }

  override warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  override debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  override verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }

  private write(
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose',
    message: unknown,
    context?: string,
    stack?: string,
  ) {
    const requestContext = getRequestContext();
    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context ?? 'ApprovaApi',
      message: this.normalizeMessage(message),
      request_id: requestContext?.requestId ?? null,
      organization_id: requestContext?.organizationId ?? null,
      approval_request_id: requestContext?.approvalRequestId ?? null,
      user_id: requestContext?.userId ?? null,
    };

    if (stack) {
      payload.stack = stack;
    }

    const serialized = JSON.stringify(payload);

    switch (level) {
      case 'error':
        process.stderr.write(`${serialized}\n`);
        break;
      case 'warn':
        process.stderr.write(`${serialized}\n`);
        break;
      default:
        process.stdout.write(`${serialized}\n`);
        break;
    }
  }

  private normalizeMessage(message: unknown) {
    if (typeof message === 'string') {
      return message;
    }

    if (message instanceof Error) {
      return message.message;
    }

    return message;
  }
}
