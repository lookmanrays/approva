# Self-Hosting Approva Open Core

Approva Open Core is the fastest path to a self-hosted approval runtime with a default
organization, passkey approvals, machine auth, service accounts, organization API keys, audit
events, immutable log records, and ledger verification.

Open-core mode is the default in this repository.

## What You Get

When `APPROVA_RUNTIME_MODE=open-core`:

- the default organization is created automatically
- the console is available through built-in local sign-in
- approval decisions still require the secure approval link and passkey auth
- service accounts, organization API keys, policies, integrations, audit, and ledger features stay enabled
- health, readiness, metrics, and ledger verification endpoints stay available

## Current Access Model

Open-core currently separates these surfaces:

- approval pages: intended to be reachable by human approvers, but each request still needs the
  secure approval URL and a passkey-authenticated approver session
- console: built-in local sign-in creates a separate operator session
- machine access: separate organization-scoped API keys and service accounts

Console auth now exists, but this is still an operator/admin surface. Keep `/console` on trusted
networks or behind additional deployment controls if you do not want it broadly reachable.

## Local Dev

```bash
make dev
```

`make dev` is the fastest local path. It starts Postgres, initializes the database,
seeds a sample approval request, and prints the exact next steps in the terminal.

For the fastest end-to-end human approval loop after startup:

```bash
make demo
```

This creates a live demo approval request, prints the secure approval URL, and waits in the
terminal until you approve, reject, or let the request expire.

Open:

- Console: [http://localhost:3000/console/approvals](http://localhost:3000/console/approvals)
- API docs: [http://localhost:4000/docs](http://localhost:4000/docs)
- Health: [http://localhost:4000/health/ready](http://localhost:4000/health/ready)

For local demos, the built-in sign-in flow is enough. For shared or internet-reachable
deployments, keep the console separated from the public approval pages and use additional network
or proxy controls where appropriate.

## Docker Self-Host

```bash
make start
```

The root [docker-compose.yml](../docker-compose.yml) runs the full open-core stack with:

- `postgres`
- `approva-api`
- `approva-console`

For a production-oriented template, use:

- [../deploy/open-core/docker-compose.self-host.yml](../deploy/open-core/docker-compose.self-host.yml)
- [../deploy/env/open-core.self-host.root.env.example](../deploy/env/open-core.self-host.root.env.example)
- [../deploy/env/open-core.self-host.api.env.example](../deploy/env/open-core.self-host.api.env.example)
- [../deploy/env/open-core.self-host.ui.env.example](../deploy/env/open-core.self-host.ui.env.example)

## Minimal Environment

Root `.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/approva?schema=public
APPROVA_RUNTIME_MODE=open-core
APPROVA_SELF_HOST_MODE=true
APPROVA_DEFAULT_ORGANIZATION_NAME="Default Organization"
APPROVA_DEFAULT_ORGANIZATION_SLUG=default
```

API `.env`:

```bash
PORT=4000
APPROVAL_UI_BASE_URL=http://localhost:3000
APPROVAL_ACCESS_TOKEN_SECRET=change-me-approval-access
WEBHOOK_SIGNING_SECRET=change-me-webhook
PASSKEY_RP_NAME=Approva
PASSKEY_RP_ID=localhost
PASSKEY_EXPECTED_ORIGINS=http://localhost:3000
```

UI `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
APPROVA_INTERNAL_API_BASE_URL=http://approva-api:4000
APPROVA_RUNTIME_MODE=open-core
APPROVA_SELF_HOST_MODE=true
```

## Verification

Run the smoke test after startup:

```bash
bash scripts/smoke-test.sh
```

Useful endpoints:

- `GET /health/live`
- `GET /health/ready`
- `GET /v1/internal/metrics`
- `POST /v1/internal/ledger/verify`

## Production Notes

- Set real secrets for `APPROVAL_ACCESS_TOKEN_SECRET` and `WEBHOOK_SIGNING_SECRET`.
- Set HTTPS origins for the UI and API before using passkeys outside localhost.
- Set `PASSKEY_RP_ID` and `PASSKEY_EXPECTED_ORIGINS` to the final console origin.
- Configure `APPROVA_INTEGRATION_ENCRYPTION_KEY` if you plan to store secret-backed integrations.
- Bootstrap the first console owner at `/sign-in` on first launch and set a strong password.
- Recommended today: public approval pages, separately protected console/admin surfaces.
- Multi-user management, profile/settings, and richer RBAC are still in progress.
