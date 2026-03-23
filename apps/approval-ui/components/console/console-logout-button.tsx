'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logoutConsole } from '@/lib/console-auth-client';

export function ConsoleLogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="console-link"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await logoutConsole();
          router.replace('/sign-in');
          router.refresh();
        })
      }
      type="button"
    >
      {isPending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
