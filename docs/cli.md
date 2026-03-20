# Approva CLI

Approva includes a lightweight machine-facing CLI for scripts, terminals, CI jobs, and agent wrappers.

It is built on top of the existing SDK and machine-authenticated API key model.

## What It Supports

Current commands:

- `approva approval request`
- `approva approval get`
- `approva capability exchange`
- `approva capability verify`
- `approva capability use`

The CLI is intentionally small. It focuses on the open-core path for agents and backend systems:

- create approval requests
- inspect approval status
- exchange one-time capability delivery tokens
- verify capabilities
- record capability use

Canonical reference:

- [Agent Integration Guide](../docs/agent-integration.md)

## Configuration

Environment variables:

- `APPROVA_BASE_URL`
  Approva API base URL
  default: `http://localhost:4000`
- `APPROVA_API_KEY`
  machine API key in the format `approva_sk_...`

You can also pass:

- `--base-url`
- `--api-key`

## Quickstart

Start Approva locally:

```bash
make dev
```

Then build the CLI:

```bash
pnpm cli:build
```

Set the CLI environment:

```bash
export APPROVA_BASE_URL=http://localhost:4000
export APPROVA_API_KEY=approva_sk_...
```

Use it directly from the repo root:

```bash
node packages/cli/dist/index.js --help
```

If you want the bare `approva` command in your shell:

```bash
pnpm --filter @approva/cli link --global
approva --help
```

## Command Examples

### Request approval

```bash
approva approval request \
  --action deployment.execute \
  --resource-type service \
  --resource-id billing-api \
  --risk-level high \
  --reason "Deploy build 2026.03.16" \
  --callback-url https://agent.example.com/webhooks/approva \
  --deliver-capability-mode exchange_token
```

Example output:

```text
Approva approval request
ID: 2c7d7d6d-37aa-4f27-8c4c-4a6f3537f875
Status: pending
Action: deployment.execute
Resource: service/billing-api
Risk level: high
Approval URL: http://localhost:3000/approval-requests/...
```

If the request is auto-approved, the CLI will also show the returned capability token.

### Get approval request

```bash
approva approval get 2c7d7d6d-37aa-4f27-8c4c-4a6f3537f875
```

### Verify capability

```bash
approva capability verify \
  --token cap_... \
  --action deployment.execute \
  --resource-type service \
  --resource-id billing-api \
  --params-json '{"environment":"production","version":"2026.03.16-demo"}'
```

### Exchange capability

```bash
approva capability exchange \
  --exchange-token cex_...
```

### Use capability

```bash
approva capability use \
  --token cap_... \
  --action deployment.execute \
  --resource-type service \
  --resource-id billing-api \
  --params-json '{"environment":"production","version":"2026.03.16-demo"}'
```

## Machine-Readable Output

Add `--json` to any CLI command to get structured JSON output that is easier to consume from scripts and AI-agent wrappers.

Example:

```bash
approva approval request \
  --action deployment.execute \
  --resource-type service \
  --resource-id billing-api \
  --risk-level high \
  --reason "Deploy build 2026.03.16" \
  --json
```

## Official Agent Flow

The canonical first-party machine continuation path is:

1. create an approval request
2. print or store the approval URL
3. configure a signed callback with `deliverCapabilityMode = exchange_token`
4. wait for `approval_request.approved`
5. exchange the one-time delivery token for the raw capability token
6. use the granted capability before executing the protected action

Full guide:

- [Agent Integration Guide](../docs/agent-integration.md)

Related examples:

- [Agent Integration Guide](../docs/agent-integration.md)
- [AI Agent Example](../examples/ai-agent/README.md)
- [GitHub Actions Example](../examples/github-actions/README.md)
- [DevOps Script Example](../examples/devops-script/README.md)

## Delivery Model

The CLI reflects the real Approva product model:

- capability tokens remain opaque
- Approva still stores only `sha256(token)` for capabilities
- later fetches still do not reveal raw capability tokens by id
- the supported machine continuation path is the one-time `exchange_token` delivery mode on approved webhooks
