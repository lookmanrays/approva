import * as Sentry from '@sentry/node';
import { getRequestContext } from './request-context';

let sentryInitialized = false;

export function initializeSentry() {
  const dsn =
    process.env.APPROVA_SENTRY_DSN?.trim() ??
    process.env.AUTHON_SENTRY_DSN?.trim();

  if (!dsn || sentryInitialized) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
  });

  sentryInitialized = true;
}

export function captureExceptionForObservability(error: unknown) {
  if (!sentryInitialized) {
    return;
  }

  const context = getRequestContext();

  Sentry.withScope((scope) => {
    if (context?.requestId) {
      scope.setTag('request_id', context.requestId);
    }

    if (context?.organizationId) {
      scope.setTag('organization_id', context.organizationId);
    }

    if (context?.approvalRequestId) {
      scope.setTag('approval_request_id', context.approvalRequestId);
    }

    if (context?.userId) {
      scope.setUser({
        id: context.userId,
      });
    }

    Sentry.captureException(error);
  });
}
