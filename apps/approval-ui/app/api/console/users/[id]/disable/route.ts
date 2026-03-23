import {
  getConsoleOperatorContext,
  getConsoleProxyOrganization,
  proxyApprovaJson,
  requireConsoleAccess,
} from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const unauthorized = await requireConsoleAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const operatorContext = await getConsoleOperatorContext();
  const { id } = await context.params;

  return proxyApprovaJson(
    `/v1/organizations/current/members/${id}/disable`,
    {
      method: 'POST',
    },
    getConsoleProxyOrganization(operatorContext),
  );
}
