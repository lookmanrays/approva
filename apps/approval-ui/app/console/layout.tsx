import Link from 'next/link';
import type { PropsWithChildren } from 'react';
import { hasOrganizationPermission } from '@approva/shared';
import { ConsoleNav } from '@/components/console/console-nav';
import { ConsoleLogoutButton } from '@/components/console/console-logout-button';
import { requireConsolePageSession } from '@/lib/console-proxy';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: PropsWithChildren) {
  const session = await requireConsolePageSession();
  const activeOrganization = session.activeOrganization;
  const canManageOrganization = hasOrganizationPermission(
    session.activeRole,
    'organization:manage',
  );
  const navLinks = [
    {
      href: '/console/approvals',
      label: 'Approvals',
    },
    ...(canManageOrganization
      ? [
          {
            href: '/console/users',
            label: 'Users',
          },
        ]
      : []),
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
      href: '/console/settings',
      label: 'Settings',
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
        <div className="console-topbar-main">
          <div className="console-brand">
            <span className="eyebrow">Operator Console</span>
            <div className="console-brand-copy">
              <h1>Approva Console</h1>
              <p>
                Review approvals and manage policies, integrations, machine access, and ledger
                activity for the default organization.
              </p>
            </div>
          </div>

          <div className="console-topbar-meta">
            <div className="console-meta-strip">
              <span className="console-meta-pill">
                {session.user?.name ?? session.user?.email ?? 'Console user'}
              </span>
              <span className="console-meta-pill">{session.user?.email ?? 'No email'}</span>
              <span className="console-meta-pill">
                {`${activeOrganization?.name ?? 'No organization'} · ${session.activeRole ?? 'no role'}`}
              </span>
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
              <ConsoleLogoutButton />
            </div>
          </div>
        </div>

        <div className="console-topbar-actions">
          <ConsoleNav links={navLinks} />
          <div className="console-topbar-security">
            <div className="label">Console access</div>
            <p className="console-topbar-note">
              Console sign-in uses a local authenticated session. Approval links are separate and
              still require the secure link plus passkey authentication.
            </p>
          </div>
        </div>
      </header>

      <div className="console-body">{children}</div>
    </div>
  );
}
