import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { ConsoleSessionState } from '@approva/shared';

const apiBaseUrl = (
  process.env.APPROVA_INTERNAL_API_BASE_URL ??
  process.env.AUTHON_INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');

export async function fetchConsoleSession(): Promise<ConsoleSessionState> {
  const cookieHeader = await readCookieHeader();
  const response = await fetch(getApprovaApiUrl('/v1/console-auth/session'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(cookieHeader
        ? {
            cookie: cookieHeader,
          }
        : {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return {
      authenticated: false,
    };
  }

  return (await response.json()) as ConsoleSessionState;
}

export async function requireConsolePageSession() {
  const session = await fetchConsoleSession();

  if (!session.authenticated) {
    redirect('/sign-in');
  }

  return session;
}

export async function requireConsoleAccess() {
  const session = await fetchConsoleSession();

  if (session.authenticated) {
    return null;
  }

  return NextResponse.json(
    {
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Sign in to the local console first.',
      },
    },
    { status: 401 },
  );
}

export async function getConsoleOperatorContext() {
  const session = await fetchConsoleSession();
  return session.authenticated ? session : null;
}

export function getConsoleProxyOrganization(
  operatorContext?: ConsoleSessionState | null,
) {
  return operatorContext?.activeOrganization
    ? {
        id: operatorContext.activeOrganization.id,
        slug: operatorContext.activeOrganization.slug,
      }
    : undefined;
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
  const cookieHeader = await readCookieHeader();
  const response = await fetch(getApprovaApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(cookieHeader
        ? {
            cookie: cookieHeader,
          }
        : {}),
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
  const nextResponse = new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
  const setCookie = response.headers.get('set-cookie');

  if (setCookie) {
    nextResponse.headers.set('set-cookie', setCookie);
  }

  return nextResponse;
}

async function readCookieHeader() {
  const requestHeaders = await headers();
  return requestHeaders.get('cookie') ?? '';
}
