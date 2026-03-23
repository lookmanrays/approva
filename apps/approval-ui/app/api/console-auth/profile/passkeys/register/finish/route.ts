import { proxyApprovaJson } from '@/lib/console-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();

  return proxyApprovaJson('/v1/console-auth/profile/passkeys/register/finish', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body,
  });
}
