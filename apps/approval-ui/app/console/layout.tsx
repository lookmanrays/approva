import Link from 'next/link';
import type { PropsWithChildren } from 'react';
import { ConsoleNav } from '@/components/console/console-nav';
import { buildDefaultOrganization, buildSelfHostedOperatorIdentity } from '@/lib/self-host';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: PropsWithChildren) {
  const operator = buildSelfHostedOperatorIdentity();
  const activeOrganization = buildDefaultOrganization();
  const navLinks = [
    {
      href: '/console/approvals',
      label: 'Approvals',
    },
    {
      href: '/console/policies',
      label: 'Policies',
    },
    {
      href: '/console/integrations',
      label: 'Integrations',
    },
    {
      href: '/console/service-accounts',
      label: 'Service Accounts',
    },
    {
      href: '/console/api-keys',
      label: 'API Keys',
    },
    {
      href: '/console/ledger',
      label: 'Ledger',
    },
    {
      href: '/help',
      label: 'Help',
    },
    {
      href: '/console/system',
      label: 'System',
    },
    {
      href: '/demo/ai-deploy',
      label: 'AI Deploy Demo',
    },
  ];

  return (
    <div className="console-shell">
      <header className="console-topbar">
        <div className="console-brand">
          <span className="eyebrow">Approva Open Core</span>
          <div className="console-brand-copy">
            <h1>Inspect approvals, decisions, capabilities, and the ledger chain.</h1>
            <p>
              Self-hosted operator console for approvals, policies, integrations, machine access,
              and ledger inspection.
            </p>
          </div>
        </div>

        <div className="console-topbar-actions">
          <ConsoleNav links={navLinks} />
          <div className="console-session-badge">
            <div className="console-session-copy">
              <span className="label">Operator session</span>
              <strong>{operator.email}</strong>
              <span>Local console access uses the default organization directly.</span>
              <span>{`${activeOrganization.name} · owner`}</span>
            </div>
          </div>
          <div className="console-links">
            <Link className="console-link" href="/">
              Approval UI
            </Link>
            <a
              className="console-link"
              href={`${apiBaseUrl}/docs`}
              rel="noreferrer"
              target="_blank"
            >
              API Docs
            </a>
          </div>
        </div>
      </header>

      <div className="console-body">{children}</div>
    </div>
  );
}
