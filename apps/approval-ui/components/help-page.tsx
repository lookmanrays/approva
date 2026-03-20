import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export function HelpPage() {
  return (
    <main className="shell auth-shell">
      <section className="hero">
        <span className="eyebrow">Approva</span>
        <h1>Get started with Approva</h1>
        <p>
          Approva lets agents and automations keep moving while routing risky actions through a
          secure human approval step. This page is the in-product quickstart and help hub for the
          self-hostable open-core runtime.
        </p>
      </section>

      <section className="grid two">
        <article className="card stack">
          <div>
            <div className="label">Approval flow</div>
            <h2>How the product works</h2>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>Step 1</span>
              <strong>Agent or backend requests approval for a risky action.</strong>
            </div>
            <div className="console-detail-item">
              <span>Step 2</span>
              <strong>Policy decides whether to auto-approve, require approval, or reject.</strong>
            </div>
            <div className="console-detail-item">
              <span>Step 3</span>
              <strong>A human opens the secure approval page and authenticates with a passkey.</strong>
            </div>
            <div className="console-detail-item">
              <span>Step 4</span>
              <strong>A scoped capability is issued and used by the agent or backend.</strong>
            </div>
            <div className="console-detail-item">
              <span>Step 5</span>
              <strong>Audit, immutable log, and ledger entries record the full event chain.</strong>
            </div>
          </div>

          <div className="actions">
            <Link className="button primary link-button" href="/demo/ai-deploy">
              Open AI deploy demo
            </Link>
            <Link className="button ghost link-button" href="/console/approvals">
              Open console
            </Link>
          </div>
        </article>

        <aside className="card stack">
          <div>
            <div className="label">Quick links</div>
            <h2>Where to go next</h2>
          </div>

          <div className="console-link-grid">
            <Link className="button ghost link-button" href="#api-quickstart">
              API quickstart
            </Link>
            <Link className="button ghost link-button" href="#cli">
              CLI usage
            </Link>
            <Link className="button ghost link-button" href="#examples">
              Examples
            </Link>
            <Link className="button ghost link-button" href="#self-host">
              Self-host
            </Link>
            <a
              className="button ghost link-button"
              href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/docs`}
              rel="noreferrer"
              target="_blank"
            >
              Swagger API docs
            </a>
          </div>

          <div className="empty">
            The default organization, operator console, and approval runtime are ready for
            self-host use.
          </div>
        </aside>
      </section>

      <section className="card stack" id="api-quickstart">
        <div>
          <div className="label">API quickstart</div>
          <h2>Create and inspect an approval request</h2>
        </div>
        <p>
          The fastest API path is: create an approval request, read its status, then verify or use
          a capability after approval. The Swagger docs show the current request and response
          shapes.
        </p>
        <pre className="params">{`curl -X POST "$APPROVA_BASE_URL/v1/approval-requests" \\
  -H "Authorization: Bearer $APPROVA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requestedBy": { "system": "deploy-agent" },
    "action": "deployment.execute",
    "riskLevel": "high",
    "resource": { "type": "service", "id": "billing-api" }
  }'`}</pre>
      </section>

      <section className="card stack" id="cli">
        <div>
          <div className="label">CLI</div>
          <h2>Use Approva from scripts, terminals, and agent wrappers</h2>
        </div>
        <p>
          The Approva CLI wraps approval request and capability commands behind
          <span className="mono"> APPROVA_BASE_URL</span> and
          <span className="mono"> APPROVA_API_KEY</span>, with backward-compatible support for
          <span className="mono"> AUTHON_BASE_URL</span> and
          <span className="mono"> AUTHON_API_KEY</span>.
        </p>
        <pre className="params">{`approva approval request \\
  --action deployment.execute \\
  --resource-type service \\
  --resource-id billing-api \\
  --risk-level high \\
  --reason "Deploy build 2026.03.16"`}</pre>
      </section>

      <section className="card stack" id="examples">
        <div>
          <div className="label">Examples</div>
          <h2>Practical ways to try Approva</h2>
        </div>
        <div className="console-detail-list">
          <div className="console-detail-item">
            <span>AI deploy demo</span>
            <strong>Use the browser demo to walk through request, passkey approval, capability use, and deployment execution.</strong>
          </div>
          <div className="console-detail-item">
            <span>AI agent pattern</span>
            <strong>Model a tool wrapper that pauses on a human checkpoint and continues after approval.</strong>
          </div>
          <div className="console-detail-item">
            <span>CLI and scripts</span>
            <strong>Use the Approva CLI or shell scripts to request approval from terminals, CI, and automation.</strong>
          </div>
        </div>
        <div className="actions">
          <Link className="button ghost link-button" href="/demo/ai-deploy">
            Open AI deploy demo
          </Link>
          <Link className="button ghost link-button" href="/help#cli">
            CLI usage
          </Link>
        </div>
      </section>

      <section className="card stack" id="self-host">
        <div>
          <div className="label">Self-host</div>
          <h2>Run the open-core foundation yourself</h2>
        </div>
        <p>
          Approva runs with a default organization, direct console access, passkey approvals,
          capabilities, audit events, immutable log, and ledger verification in this self-hosted
          repository.
        </p>
        <div className="empty">
          Use the self-host Docker and env templates in the repository for the single-organization
          operator path.
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
