import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

interface LocalDashboardRedirectOptions {
  redirectTo?: string;
}

function normalizeConsolePath(path?: string | null) {
  return path?.startsWith('/') ? path : '/console/approvals';
}

function redirectToLocalConsole(request: Request) {
  return NextResponse.redirect(new URL('/sign-in', request.url));
}

// Preserve the old auth export surface so existing UI routes keep working while
// local console auth now lives behind the self-host sign-in page.
export const handlers = {
  GET: async (request: Request) => redirectToLocalConsole(request),
  POST: async (request: Request) => redirectToLocalConsole(request),
};

export async function auth() {
  return null;
}

export async function signIn(
  _provider?: string,
  options?: LocalDashboardRedirectOptions,
) {
  redirect(`/sign-in?callbackUrl=${encodeURIComponent(normalizeConsolePath(options?.redirectTo))}`);
}

export async function signOut(options?: LocalDashboardRedirectOptions) {
  redirect(`/sign-in?callbackUrl=${encodeURIComponent(normalizeConsolePath(options?.redirectTo))}`);
}
