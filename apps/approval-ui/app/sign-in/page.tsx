import { SiteFooter } from '@/components/site-footer';
import { ConsoleAuthPage } from '@/components/console/console-auth-page';

interface SignInPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(
  value: string | string[] | undefined,
  fallback: string,
) {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function normalizeConsolePath(path: string) {
  return path.startsWith('/') ? path : '/console/settings';
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const callbackUrl = normalizeConsolePath(
    readSearchParam(resolvedSearchParams?.callbackUrl, '/console/settings'),
  );

  return (
    <main className="shell auth-shell">
      <ConsoleAuthPage callbackUrl={callbackUrl} />
      <SiteFooter />
    </main>
  );
}
