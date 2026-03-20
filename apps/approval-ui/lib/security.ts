import type { NextConfig } from 'next';

export function buildUiSecurityHeaders(env: NodeJS.ProcessEnv = process.env): NonNullable<
  NextConfig['headers']
> {
  const headers = [
    {
      key: 'Content-Security-Policy',
      value: buildUiCsp(env),
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    {
      key: 'Permissions-Policy',
      value: [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ].join(', '),
    },
  ];

  return async () => [
    {
      source: '/:path*',
      headers,
    },
  ];
}

function buildUiCsp(env: NodeJS.ProcessEnv) {
  const connectSources = new Set<string>(["'self'"]);

  for (const candidate of [
    env.NEXT_PUBLIC_API_BASE_URL,
    env.APPROVAL_UI_BASE_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'ws://localhost:3000',
    'ws://127.0.0.1:3000',
  ]) {
    const origin = getUrlOrigin(candidate);

    if (origin) {
      connectSources.add(origin);
    }
  }

  const scriptSources = ["'self'", "'unsafe-inline'"];

  if ((env.NODE_ENV ?? 'development') !== 'production') {
    scriptSources.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `connect-src ${Array.from(connectSources).join(' ')}`,
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
  ].join('; ');
}

function getUrlOrigin(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}
