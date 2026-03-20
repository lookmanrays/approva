import { LegalPage } from '@/components/legal-page';

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Approva Privacy"
      intro="Minimal draft privacy page for self-hosted Approva deployments."
      sections={[
        {
          heading: 'What Approva collects',
          body: (
            <>
              <p>
                Approva processes account identity data, approval request metadata, audit events,
                immutable log entries, ledger records, webhook delivery records, and operational
                usage logs required to run the service.
              </p>
              <p>
                Self-hosted deployments may also process email addresses for approver identity,
                operator contact metadata, and notification delivery.
              </p>
            </>
          ),
        },
        {
          heading: 'How data is used',
          body: (
            <>
              <p>
                Approva uses this data to authenticate users, present approval requests, issue
                scoped capabilities, deliver notifications, and maintain the audit and ledger
                event chain.
              </p>
              <p>
                Approva is not designed to treat Slack or email notifications as the approval
                security boundary. Those channels are used for awareness and product operations
                only.
              </p>
            </>
          ),
        },
        {
          heading: 'Deployment note',
          body: (
            <p>
              This page is a placeholder for self-hosted deployment. Data processing terms,
              retention policy, subprocessors, and deletion commitments should be reviewed before
              production rollout.
            </p>
          ),
        },
      ]}
    />
  );
}
