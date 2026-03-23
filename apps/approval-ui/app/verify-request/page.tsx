import Link from 'next/link';

export default function VerifyRequestPage() {
  return (
    <main className="shell auth-shell">
      <section className="auth-grid single">
        <article className="card stack">
          <div>
            <span className="eyebrow">Approva</span>
            <h1 className="auth-title">Open the console sign-in</h1>
          </div>

          <p>
            Use the local console sign-in for operator access, and use the approval link plus
            passkey flow for approval decisions.
          </p>

          <div className="empty">
            This route is kept only as a compatibility landing page so older links do not break.
          </div>

          <div className="actions">
            <Link className="button primary link-button" href="/sign-in">
              Go to console sign-in
            </Link>
            <Link className="button ghost link-button" href="/">
              Back to landing
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
