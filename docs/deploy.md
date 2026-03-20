# Deploying Approva Open Core

This repository is optimized for self-host deployment.

## Recommended Paths

### Local stack

Use the root compose file for a full local stack:

```bash
make start
```

### Production-style self-host

Use:

- [../deploy/open-core/docker-compose.self-host.yml](../deploy/open-core/docker-compose.self-host.yml)
- [../deploy/env/open-core.self-host.root.env.example](../deploy/env/open-core.self-host.root.env.example)
- [../deploy/env/open-core.self-host.api.env.example](../deploy/env/open-core.self-host.api.env.example)
- [../deploy/env/open-core.self-host.ui.env.example](../deploy/env/open-core.self-host.ui.env.example)

## Required Deployment Decisions

Before production rollout, set:

- database connection and persistence
- API and UI public origins
- `APPROVAL_ACCESS_TOKEN_SECRET`
- `WEBHOOK_SIGNING_SECRET`
- passkey relying-party values
- TLS termination for the UI and API

## Passkey And Origin Settings

For a deployment like:

- UI: `https://app.example.com`
- API: `https://api.example.com`

use values like:

```bash
APPROVAL_UI_BASE_URL=https://app.example.com
PASSKEY_RP_ID=app.example.com
PASSKEY_EXPECTED_ORIGINS=https://app.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
```

## Post-Deploy Checks

Verify:

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
curl http://localhost:4000/v1/internal/metrics
```

and run:

```bash
bash scripts/smoke-test.sh
```

## Optional Add-Ons

- Resend-backed email delivery for approval notifications
- Slack fallback delivery
- encrypted organization integrations via `APPROVA_INTEGRATION_ENCRYPTION_KEY`

This repository ships and documents the self-host deployment path only.
