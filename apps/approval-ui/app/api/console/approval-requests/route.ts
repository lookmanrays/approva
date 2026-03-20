import { type NextRequest, NextResponse } from 'next/server';
import {
  proxyApprovaJson,
  getConsoleOperatorContext,
  getConsoleProxyOrganization,
  requireConsoleAccess,
} from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unauthorized = await requireConsoleAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const operatorContext = await getConsoleOperatorContext();
  const query = request.nextUrl.searchParams.toString();

  return proxyApprovaJson(
    `/v1/internal/approval-requests${query ? `?${query}` : ''}`,
    {
      method: 'GET',
    },
    getConsoleProxyOrganization(operatorContext),
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is supported for this internal console route.',
      },
    },
    { status: 405 },
  );
}
