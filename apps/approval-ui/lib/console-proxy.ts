import { NextResponse } from 'next/server';

const apiBaseUrl = (
  process.env.APPROVA_INTERNAL_API_BASE_URL ??
  process.env.AUTHON_INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');

export async function requireConsoleAccess() {
  return null;
}

export async function getConsoleOperatorContext() {
  return null;
}

export function getConsoleProxyOrganization(_operatorContext?: unknown) {
  return undefined;
}

export function getApprovaApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function proxyApprovaJson(
  path: string,
  init?: RequestInit,
  organization?: {
    id: string;
    slug?: string | null;
  },
) {
  const response = await fetch(getApprovaApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(organization?.id
        ? {
            'x-approva-organization-id': organization.id,
          }
        : {}),
      ...(organization?.slug
        ? {
            'x-approva-organization-slug': organization.slug,
          }
        : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
