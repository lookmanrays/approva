import {
  getConsoleOperatorContext,
  getConsoleProxyOrganization,
  proxyApprovaJson,
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
    '/v1/organizations/current/security-events',
    {
      method: 'GET',
    },
    getConsoleProxyOrganization(operatorContext),
  );
}
