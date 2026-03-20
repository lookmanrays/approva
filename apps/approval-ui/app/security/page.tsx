import { LegalPage } from '@/components/legal-page';

export default function SecurityPage() {
  return (
    <LegalPage
      eyebrow="Security"
      title="Approva Security"
      intro="Minimal security overview for self-hosted Approva deployments."
      sections={[
        {
          heading: 'Security model',
          body: (
            <>
              <p>
                Approva keeps local console access separate from approval authentication. The
                self-host operator console opens directly, while risky action approval still
                requires a secure approval link and a passkey-authenticated human decision.
              </p>
              <p>
                Machine access is separate again through organization-scoped API keys. These auth
                domains are intentionally not merged together.
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
          heading: 'Deployment note',
          body: (
            <p>
              This page is a placeholder overview, not a formal security commitment. Incident
              response, infrastructure controls, and compliance posture should be documented more
              fully before production rollout.
            </p>
          ),
        },
      ]}
    />
  );
}
