import {
  proxyApprovaJson,
  getConsoleOperatorContext,
  getConsoleProxyOrganization,
  requireConsoleAccess,
} from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const unauthorized = await requireConsoleAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const operatorContext = await getConsoleOperatorContext();
  const { id } = await context.params;
  const body = await request.text();

  return proxyApprovaJson(
    `/v1/integrations/${id}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body,
    },
    getConsoleProxyOrganization(operatorContext),
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireConsoleAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const operatorContext = await getConsoleOperatorContext();
  const { id } = await context.params;

  return proxyApprovaJson(
    `/v1/integrations/${id}`,
    {
      method: 'DELETE',
    },
    getConsoleProxyOrganization(operatorContext),
  );
}
