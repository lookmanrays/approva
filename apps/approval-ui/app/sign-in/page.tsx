import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

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
  return path.startsWith('/') ? path : '/console/approvals';
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const callbackUrl = normalizeConsolePath(
    readSearchParam(resolvedSearchParams?.callbackUrl, '/console/approvals'),
  );

  return (
    <main className="shell auth-shell">
      <section className="auth-grid">
        <article className="card stack">
          <div>
            <span className="eyebrow">Approva</span>
            <h1 className="auth-title">No console sign-in required</h1>
          </div>

          <p>
            Self-hosted Approva opens the operator console directly. Use the console for local
            operation and the approval link plus passkey flow for risky action decisions.
          </p>

          <div className="notice info">
            <strong>Self-host console access</strong>
            <div>
              Open the console directly for local operation, debugging, and demos. Approval
              requests still require their secure approval link plus passkey authentication.
            </div>
          </div>

          <div className="actions">
            <Link className="button primary link-button" href={callbackUrl}>
              Open console
            </Link>
            <Link className="button ghost link-button" href="/">
              Back to landing
            </Link>
          </div>
        </article>

        <aside className="card stack">
          <div>
            <div className="label">Auth model</div>
            <h2>Console access stays separate from approval auth</h2>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>Console access</span>
              <strong>Local self-host operator context</strong>
            </div>
            <div className="console-detail-item">
              <span>Used for</span>
              <strong>Inspection, policies, integrations, machine access, ledger views</strong>
            </div>
            <div className="console-detail-item">
              <span>Approval auth</span>
              <strong>Approval access token + passkey approver session</strong>
            </div>
          </div>

          <div className="empty">
            Approval request pages such as
            <span className="mono"> /approval-requests/&lt;id&gt;</span> do not require dashboard
            login and continue to use the secure approval flow.
          </div>

          <Link className="button ghost link-button" href="/help#self-host">
            Self-host guide
          </Link>
          <Link className="button ghost link-button" href="/help">
            Help hub
          </Link>
        </aside>
      </section>

      <SiteFooter />
    </main>
  );
}
