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
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Approva</span>
        <h1>Approve risky AI actions without losing traceability.</h1>
        <p>
          Approva is human approval infrastructure for AI actions. This UI resolves
          a request by id, surfaces the action context, and submits an approval or
          rejection against the API while capability binding and audit-chain
          recording stay server-side.
        </p>
        <div className="notice info">
          <strong>Deployment</strong>
          <div>
            This deployment uses the default organization path for self-host operator access.
          </div>
        </div>
      </section>

      <section className="grid two">
        <article className="card stack">
          <div>
            <div className="label">Open request</div>
            <h2>Load a specific approval request</h2>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <label className="field">
              <span>Approval URL or request id</span>
              <input
                value={approvalLocation}
                onChange={(event) => setApprovalLocation(event.target.value)}
                placeholder="Paste the approval URL returned by the API"
              />
            </label>
            <button className="button primary" type="submit">
              Open approval
            </button>
          </form>
        </article>

        <aside className="card stack">
          <div>
            <div className="label">Demo flow</div>
            <h2>Run the AI deploy approval scenario</h2>
          </div>
          <p>
            Walk through the full Approva loop: an AI deploy agent requests approval,
            a human authenticates with a passkey, a scoped capability is issued,
            and the agent uses it before deployment execution is recorded.
          </p>
          <a className="button primary link-button" href="/demo/ai-deploy">
            Open AI deploy demo
          </a>
          <a className="button ghost link-button" href="/console/approvals">
            Open console
          </a>
          <a className="button ghost link-button" href="/help">
            Open help
          </a>
          <div className="empty">
            The demo page creates a production deployment approval request for
            <span className="mono"> billing-api</span> and shows the live event chain.
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
