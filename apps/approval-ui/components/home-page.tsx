'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SiteFooter } from '@/components/site-footer';

export function HomePage() {
  const router = useRouter();
  const [approvalLocation, setApprovalLocation] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const value = approvalLocation.trim();

    if (!value) {
      return;
    }

    try {
      const url = new URL(value);
      router.push(`${url.pathname}${url.search}`);
      return;
    } catch {
      router.push(`/approval-requests/${value}`);
    }
  };

  return (
    <main className="shell home-shell">
      <section className="card home-masthead">
        <div className="home-masthead-bar">
          <span className="eyebrow">Approva Open Core</span>
          <div className="home-masthead-links">
            <a className="home-masthead-link" href="/console/approvals">
              Console
            </a>
            <a className="home-masthead-link" href="/help">
              Help
            </a>
            <a className="home-masthead-link" href="/demo/ai-deploy">
              Demo
            </a>
          </div>
        </div>

        <div className="home-masthead-grid">
          <div className="home-copy">
            <h1>Human approval for risky AI actions.</h1>
            <p>
              Open an approval request, review action context, authenticate the approver with a
              passkey, and let Approva issue scoped capabilities while the audit and ledger chain
              stay intact.
            </p>
          </div>

          <div className="home-status-card">
            <div className="label">Current deployment</div>
            <div className="home-status-list">
              <div className="home-status-item">
                <strong>Console access</strong>
                <span>Default organization path is enabled for self-host operation.</span>
              </div>
              <div className="home-status-item">
                <strong>Approval auth</strong>
                <span>Approval pages require the secure request link plus passkey flow.</span>
              </div>
              <div className="home-status-item">
                <strong>Runtime</strong>
                <span>Audit events, immutable log, ledger, API keys, and service accounts stay local.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid two home-grid">
        <article className="card stack home-primary-card">
          <div>
            <div className="label">Open request</div>
            <h2>Load a specific approval request</h2>
          </div>
          <form className="stack home-request-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Approval URL or request id</span>
              <input
                value={approvalLocation}
                onChange={(event) => setApprovalLocation(event.target.value)}
                placeholder="Paste the approval URL returned by the API"
              />
            </label>
            <div className="home-request-actions">
              <button className="button primary" type="submit">
                Open approval
              </button>
              <span className="helper">
                Paste the full approval URL or just the request id.
              </span>
            </div>
          </form>
        </article>

        <aside className="card stack home-side-card">
          <div>
            <div className="label">Demo flow</div>
            <h2>Run the AI deploy approval scenario</h2>
          </div>
          <p>
            Walk through the full Approva loop: an AI deploy agent requests approval,
            a human authenticates with a passkey, a scoped capability is issued,
            and the agent uses it before deployment execution is recorded.
          </p>
          <div className="home-side-actions">
            <a className="button primary link-button" href="/demo/ai-deploy">
              Open AI deploy demo
            </a>
            <a className="button ghost link-button" href="/console/approvals">
              Open console
            </a>
            <a className="button ghost link-button" href="/help">
              Open help
            </a>
          </div>
          <div className="empty">
            The demo page creates a production deployment approval request for
            <span className="mono"> deploy-controller</span> and shows the live event chain.
          </div>
          <div className="empty">
            Approval request pages continue to use the secure approval token plus passkey flow.
          </div>
        </aside>
      </section>

      <section className="card stack">
        <div>
          <div className="label">Open Core</div>
          <h2>Self-host the full approval loop</h2>
        </div>
        <p>
          This repository is the public, self-hostable open-core edition of Approva. It keeps the
          approval engine, policy engine, passkey approvals, machine auth, service accounts,
          organization API keys, audit trail, immutable log, ledger verification, CLI, SDK, and
          examples together in one runnable repo.
        </p>
        <div className="actions">
          <a className="button ghost link-button" href="/privacy">
            Privacy
          </a>
          <a className="button ghost link-button" href="/terms">
            Terms
          </a>
          <a className="button ghost link-button" href="/security">
            Security
          </a>
          <a className="button ghost link-button" href="/help">
            Help
          </a>
        </div>
        <div className="empty">
          This repository is optimized for self-hosting and local development.
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
