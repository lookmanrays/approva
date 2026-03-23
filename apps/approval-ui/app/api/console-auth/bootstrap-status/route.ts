import { proxyApprovaJson } from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyApprovaJson('/v1/console-auth/bootstrap-status', {
    method: 'GET',
  });
}
