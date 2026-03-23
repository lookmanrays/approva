import { proxyApprovaJson } from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ credentialId: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { credentialId } = await context.params;

  return proxyApprovaJson(`/v1/console-auth/profile/passkeys/${credentialId}`, {
    method: 'DELETE',
  });
}
