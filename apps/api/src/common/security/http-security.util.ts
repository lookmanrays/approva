const DEFAULT_LOCAL_UI_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

export function buildAllowedApiOrigins(env: NodeJS.ProcessEnv = process.env) {
  const origins = new Set<string>();

  for (const candidate of [
    env.APPROVAL_UI_BASE_URL,
    ...parseCsv(env.APPROVA_API_ALLOWED_ORIGINS ?? env.AUTHON_API_ALLOWED_ORIGINS),
  ]) {
    const origin = normalizeOrigin(candidate);

    if (origin) {
      origins.add(origin);
    }
  }

  if ((env.NODE_ENV ?? 'development') !== 'production') {
    for (const origin of DEFAULT_LOCAL_UI_ORIGINS) {
      origins.add(origin);
    }
  }

  return origins;
}

export function buildApiSecurityHeaders(pathname: string) {
  const headers = new Map<string, string>();
  const isDocsPath = pathname === '/docs' || pathname.startsWith('/docs/');

  headers.set(
    'Content-Security-Policy',
    isDocsPath ? buildSwaggerApiCsp() : buildDefaultApiCsp(),
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  );

  return headers;
}

function buildDefaultApiCsp() {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
  ].join('; ');
}

function buildSwaggerApiCsp() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "object-src 'none'",
  ].join('; ');
}

function parseCsv(value?: string | null) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOrigin(value?: string | null) {
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
