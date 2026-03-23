# Approva Open Core

Human approval infrastructure for AI actions.

Approva Open Core lets agents, automations, and backend services pause risky actions for a
passkey-authenticated human approval, then continue with a short-lived scoped capability and a
verifiable event chain.

Core flow:

`Agent proposes action -> policy evaluates risk -> execution pauses -> human approves with passkey -> scoped capability issued -> execution continues -> audit and ledger recorded`

Quick links:

- [Self-host quickstart](#self-host-quickstart)
- [CLI quickstart](#cli-quickstart)
- [Examples](#examples)
- [Docs](#docs)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Self-Host Quickstart

### Local developer mode

```bash
make dev
```

This single command:

- starts Postgres in Docker
- installs dependencies on first run
- generates the Prisma client
- applies the schema automatically
- seeds a sample approval request
- prints the console URL, API docs URL, sample approver, and approval URL

Then run the built-in round-trip demo:

```bash
make demo
```

It creates a live high-risk approval request, prints the secure approval URL, waits while you
approve it in the UI, and then prints the result in the terminal.

- Console: [http://localhost:3000/console/approvals](http://localhost:3000/console/approvals)
- API docs: [http://localhost:4000/docs](http://localhost:4000/docs)
- Health: [http://localhost:4000/health/ready](http://localhost:4000/health/ready)

Important security note:

- approval pages can be shared with intended human approvers because they still require the
  secure approval link plus passkey authentication
- the console now requires a local authenticated session
- protect the console with strong owner credentials from first launch onward
- approval auth and console auth remain separate on purpose

### Docker self-host flow

```bash
make start
```

Or use the production-oriented open-core compose example:

- [deploy/open-core/docker-compose.self-host.yml](deploy/open-core/docker-compose.self-host.yml)
- [deploy/env/open-core.self-host.root.env.example](deploy/env/open-core.self-host.root.env.example)
- [deploy/env/open-core.self-host.api.env.example](deploy/env/open-core.self-host.api.env.example)
- [deploy/env/open-core.self-host.ui.env.example](deploy/env/open-core.self-host.ui.env.example)

## What Approva Open Core Includes

Approva Open Core is the public, self-hostable edition of Approva. This repository keeps the
parts that make the product genuinely useful in real deployments:

- approval request lifecycle
- policy engine and approver-role routing
- passkey approval flow
- scoped capability issuance and verification
- exchange-token continuation path for machine clients
- machine auth, service accounts, and organization API keys
- audit trail, immutable log, and ledger verification
- operator console for local or externally protected admin access
- CLI, SDK, and runnable examples
- rate limiting, health checks, readiness checks, metrics, and basic observability
- Docker-based self-host flow and self-host docs

Current open-core access model:

- approval auth is real and separate: secure approval link plus passkey
- console auth is built in for local self-host use
- multi-user lifecycle, profile/settings, and broader RBAC hardening are still being added

## CLI Quickstart

Build the CLI:

```bash
pnpm cli:build
```

Request an approval:

```bash
node packages/cli/dist/index.js approval request \
  --action deployment.execute \
  --resource-type service \
  --resource-id billing-api \
  --risk-level high \
  --reason "Deploy build 2026.03.16"
```

More details:

- [docs/cli.md](docs/cli.md)
- [docs/api-quickstart.md](docs/api-quickstart.md)

## Examples

- Start the local stack first with `make dev` or `make start`.
- [examples/README.md](examples/README.md)
- [examples/ai-agent/README.md](examples/ai-agent/README.md)
- [examples/github-actions/README.md](examples/github-actions/README.md)
- [examples/devops-script/README.md](examples/devops-script/README.md)
- [examples/node-deploy-agent/README.md](examples/node-deploy-agent/README.md)

## Machine And Agent Integration

The recommended machine path is:

1. Create an approval request.
2. Wait for approval or auto-approval.
3. Receive a signed webhook with a short-lived exchange token.
4. Exchange that token once for the raw capability.
5. Use the capability to continue the protected action.

Start here:

- [docs/agent-integration.md](docs/agent-integration.md)
- [docs/webhooks.md](docs/webhooks.md)
- [docs/service-accounts.md](docs/service-accounts.md)

## Open Core vs Cloud

- This repo defaults to open-core behavior and a single self-hosted organization.
- The public repository is documented around self-hosting, local development, and machine
  integration.
- Hosted Approva Cloud is separate. Hosted signup, billing, and other commercial rollout surfaces
  are not part of this repository.

## License

Approva Open Core is source-available.

You can:

- self-host
- modify
- use commercially
- include it in your product

You cannot:

- offer Approva itself as a standalone hosted SaaS
- create a competing approval platform
- rebrand Approva

Attribution is required.

For SaaS / OEM licensing:
[founders@approva.xyz](mailto:founders@approva.xyz)

## Docs

- [docs/README.md](docs/README.md)
- [docs/self-host.md](docs/self-host.md)
- [docs/deploy.md](docs/deploy.md)
- [docs/runtime-modes.md](docs/runtime-modes.md)
- [docs/environment-reference.md](docs/environment-reference.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/monitoring.md](docs/monitoring.md)
- [docs/rate-limits.md](docs/rate-limits.md)
- [docs/demo-ai-deploy.md](docs/demo-ai-deploy.md)

## Project

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)
- [docs/license.md](docs/license.md)
