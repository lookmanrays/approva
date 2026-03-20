# AI Agent Example

This is the canonical first-party Approva machine flow in a minimal local example.

It shows an agent that:

1. authenticates with an organization API key
2. creates an approval request with `deliverCapabilityMode=exchange_token`
3. exposes a signed webhook receiver
4. waits for `approval_request.approved`
5. exchanges the short-lived one-time delivery token
6. uses the opaque capability token
7. continues the protected action

Canonical reference:

- [Agent Integration Guide](../../docs/agent-integration.md)

Files:

- [human-checkpoint.mjs](./human-checkpoint.mjs)
- [webhook-signature.mjs](./webhook-signature.mjs)

## Run

From the repo root:

```bash
pnpm install
pnpm cli:build
```

Then:

```bash
export APPROVA_BASE_URL=http://localhost:4000
export APPROVA_API_KEY=approva_sk_...
export WEBHOOK_SIGNING_SECRET=change-me-webhook

node examples/ai-agent/human-checkpoint.mjs
```

Optional:

```bash
export AI_AGENT_PORT=4300
export AI_AGENT_PUBLIC_BASE_URL=http://localhost:4300
node examples/ai-agent/human-checkpoint.mjs
```

Then:

1. open the printed approval URL
2. authenticate with a passkey
3. approve the request
4. the local agent receives the signed webhook, exchanges the one-time token, uses the capability, and prints `Deployment executed.`

## Supported Flow

This example now reflects the officially supported machine continuation path:

- signed approval webhook
- `exchange_token` capability delivery mode
- one-time `POST /v1/capabilities/exchange`
- opaque capability use through `POST /v1/capabilities/use`

It does not rely on manual raw-token handoff.

## Related Docs

- [Agent Integration Guide](../../docs/agent-integration.md)
- [Service Accounts And API Keys](../../docs/service-accounts.md)
- [Webhook Guide](../../docs/webhooks.md)

## Notes

- the webhook receiver must be reachable from Approva
- exchange tokens are short-lived and single-use
- raw capability tokens are still never re-fetchable later by id
- approval auth remains separate from machine auth by design
