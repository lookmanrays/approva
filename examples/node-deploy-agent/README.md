# Node Deploy Agent Example

This example simulates a backend service or AI deploy agent integrating with Approva.

It does four things:

1. creates an approval request for `deployment.execute`
2. exposes a signed webhook receiver for Approva terminal events
3. exchanges the one-time capability delivery token when approval arrives
4. calls `POST /v1/capabilities/use` before simulating `deployment executed`

## Local Run

From the repo root:

```bash
cp examples/node-deploy-agent/.env.example examples/node-deploy-agent/.env
pnpm install
pnpm build:packages
pnpm --filter @approva-example/node-deploy-agent dev
```

Default local settings:

- example app: `http://localhost:4100`
- webhook receiver: `http://localhost:4100/webhooks/approva`
- Approva API base URL: `http://localhost:4000`
- Approva API key: `APPROVA_API_KEY=approva_sk_...`

## Routes

- `GET /`
  minimal operator page with current state and helper actions
- `GET /state`
  JSON state snapshot
- `POST /request-approval`
  creates a new Approva approval request
- `POST /webhooks/approva`
  verifies `X-Approval-Signature` and `X-Approval-Timestamp`

## Capability Continuation Path

This example uses Approva's supported machine continuation flow:

- the approval request is created with `deliverCapabilityMode = exchange_token`
- the signed `approval_request.approved` webhook includes:
  - `capabilityId`
  - `capabilityExchangeToken`
  - `capabilityExchangeExpiresAt`
- the agent exchanges that one-time token through `POST /v1/capabilities/exchange`
- Approva returns the raw opaque capability token once
- the agent calls `POST /v1/capabilities/use`

## Related Docs

- [Agent Integration Guide](../../docs/agent-integration.md)
- [Node Integration Guide](../../docs/integration-node.md)
- [Webhook Guide](../../docs/webhooks.md)
