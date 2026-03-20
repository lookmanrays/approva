# Bootstrap Guide

The bootstrap script helps prepare a fresh open-core deployment with a default organization,
optional machine identity, and notification integrations.

Run:

```bash
pnpm bootstrap -- --help
```

## Common Open-Core Bootstrap

Create or reuse the default organization, a service account, and an API key:

```bash
APPROVA_RUNTIME_MODE=open-core APPROVA_SELF_HOST_MODE=true pnpm bootstrap -- \
  --organization-name "Default Organization" \
  --organization-slug default \
  --create-service-account \
  --service-account-name "Bootstrap Agent" \
  --create-api-key \
  --api-key-name "Bootstrap Agent Key" \
  --api-key-scopes approval_requests:create,approval_requests:read,capabilities:verify,capabilities:use
```

Add fallback notification integrations at the same time:

```bash
APPROVA_RUNTIME_MODE=open-core APPROVA_SELF_HOST_MODE=true pnpm bootstrap -- \
  --organization-name "Default Organization" \
  --organization-slug default \
  --email-recipients approver@example.com \
  --webhook-url https://agent.example.com/webhooks/approva \
  --webhook-secret change-me
```

## What The Script Can Do

- create or target an organization
- create or reuse a service account
- create or reuse an organization API key
- create or update email, Slack, and webhook integrations

## Notes

- The script still understands the shared runtime-mode flags used across the codebase.
- For this public repo, use it primarily with `APPROVA_RUNTIME_MODE=open-core`.
