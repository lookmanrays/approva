import { NextResponse } from 'next/server';
import {
  proxyApprovaJson,
  getConsoleOperatorContext,
  getConsoleProxyOrganization,
  requireConsoleAccess,
} from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  const unauthorized = await requireConsoleAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const operatorContext = await getConsoleOperatorContext();

  return proxyApprovaJson(
    '/v1/api-keys',
    {
      method: 'GET',
    },
    getConsoleProxyOrganization(operatorContext),
  );
}

export async function POST(request: Request) {
  const unauthorized = await requireConsoleAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const operatorContext = await getConsoleOperatorContext();
  const body = await request.text();

  return proxyApprovaJson(
    '/v1/api-keys',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body,
    },
    getConsoleProxyOrganization(operatorContext),
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use /api/console/api-keys/:id/revoke for API key changes.',
      },
    },
    { status: 405 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use /api/console/api-keys/:id/revoke for API key changes.',
      },
    },
    { status: 405 },
  );
}
