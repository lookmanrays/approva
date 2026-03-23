import { LegalPage } from '@/components/legal-page';

export default function SecurityPage() {
  return (
    <LegalPage
      eyebrow="Security"
      title="Approva Security"
      intro="Minimal security overview for self-hosted Approva deployments."
      sections={[
        {
          heading: 'Current access model',
          body: (
            <>
              <p>
                Approva keeps approval authentication separate from console access. Approval pages
                use the secure approval link plus a passkey-authenticated human decision. The
                self-host console now uses its own local authenticated session.
              </p>
              <p>
                Machine access is separate again through organization-scoped API keys. These auth
                domains are intentionally not merged together.
              </p>
            </>
          ),
        },
        {
          heading: 'Console deployment guidance',
          body: (
            <>
              <p>
                The console is now protected by built-in local sign-in, but it is still an
                operator/admin surface. Keep it on trusted networks or behind additional proxy or
                network controls if you do not want it broadly reachable.
              </p>
              <p>
                Public approval pages are a different surface. They can be reachable by intended
                approvers because they still require the secure approval link and passkey
                authentication before a decision can be recorded.
              </p>
            </>
          ),
        },
        {
          heading: 'Approval controls',
          body: (
            <>
              <p>
                Approval requests can be paused, approved, rejected, expired, or auto-approved
                according to policy. Issued capabilities are opaque, scoped, expiring, and
                verified against action, resource, and params bindings.
              </p>
              <p>
                Approva records important actions across the operational audit table, immutable log,
                and deterministic ledger hash chain.
              </p>
            </>
          ),
        },
        {
          heading: 'Browser and session protections',
          body: (
            <>
              <p>
                Approva applies baseline security headers across the UI and API, including Content
                Security Policy, frame protection, content-type sniffing protection, referrer
                policy, and a restrictive permissions policy.
              </p>
              <p>
                Browser session state stays on the app domain when used locally. Passkey
                approver-session cookies stay on the API domain. In production, both should run
                over HTTPS so secure cookies are enabled automatically.
              </p>
            </>
          ),
        },
        {
          heading: 'Current limitations',
          body: (
            <>
              <p>
                Built-in local console auth, local user management, and a profile or settings flow
                for passkey management are now in place in open-core.
              </p>
              <p>
                Approval passkeys and console login remain separate by design. Passkeys are now
                enrolled from Console Settings, while approval pages are limited to existing
                passkey authentication plus final approve or reject decisions.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
