import { proxyApprovaJson } from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

export async function POST() {
  return proxyApprovaJson('/v1/console-auth/profile/passkeys/register/start', {
    method: 'POST',
  });
}
