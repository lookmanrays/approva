# Agent Integration Guide

This document describes the canonical first-party machine integration path for Approva.

Use this flow for:

- AI agents
- backend services
- CI/CD runners
- automation workers
- tool wrappers that need a human approval checkpoint before continuing

## Official Machine Flow

1. authenticate with an organization API key
2. create an approval request
3. include a signed webhook callback
4. enable `deliverCapabilityMode = exchange_token`
5. wait for `approval_request.approved`
6. exchange the one-time delivery token
7. use the opaque capability token
8. continue the protected action

This is the recommended continuation path in the current open-core runtime.

It is first-party, supported, and aligned with Approva's security model.

## Why This Is The Recommended Path

Approva intentionally does **not** allow later raw capability-token fetches by id.

That means a machine client should not expect to:

- poll for a request and later retrieve the raw capability token
- read the token back from the console
- fetch the token through another API after approval

Instead, Approva delivers a short-lived single-use exchange token on the approved webhook. The machine client exchanges that token once and receives the raw opaque capability token at that point.

## Prerequisites

- an Approva organization
- a machine API key in the format `approva_sk_...`
- an approval policy that requires approval for the action you want to gate
- a webhook receiver that can verify:
  - `X-Approval-Signature`
  - `X-Approval-Timestamp`

## Step 1: Authenticate With An Organization API Key

Machine clients authenticate with:

```http
Authorization: Bearer approva_sk_...
```

The API key resolves:

- organization
- key status
- key scopes
- optional service-account identity

## Step 2: Create An Approval Request

Create the request with:

- your machine API key
- a callback webhook URL
- `deliverCapabilityMode = exchange_token`

Example:

```bash
curl -X POST "http://localhost:4000/v1/approval-requests" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deploy-run-001" \
  -d '{
    "externalRequestId": "deploy-run-001",
    "requestedBy": {
      "system": "deploy-agent",
      "actorId": "billing-api-release-runner"
    },
    "action": "deployment.execute",
    "riskLevel": "high",
    "resource": {
      "type": "service",
      "id": "billing-api"
    },
    "params": {
      "environment": "production",
      "version": "2026.03.16-demo",
      "region": "eu-west-1"
    },
    "callback": {
      "webhookUrl": "https://agent.example.com/webhooks/approva",
      "deliverCapabilityMode": "exchange_token"
    }
  }'
```

If the request becomes `pending`, Approva returns an `approvalUrl` for the human approver.

If the request is `auto_approved`, Approva may return a capability immediately and no webhook wait is required.

## Step 3: Receive The Signed Approval Webhook

When a human approves the request, Approva sends a signed `approval_request.approved` webhook.

In `exchange_token` mode, the webhook payload includes:

- `approvalRequestId`
- `capabilityId`
- `capabilityExchangeToken`
- `capabilityExchangeExpiresAt`

Example payload:

```json
{
  "id": "3f01c902-3c06-4429-a6b5-96f2436fe8a8",
  "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
  "eventType": "approval_request.approved",
  "occurredAt": "2026-03-16T13:45:21.000Z",
  "payload": {
    "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
    "status": "approved",
    "capabilityId": "91f8ef51-61cf-4f0a-80c0-8cfd5fe969df",
    "capabilityExchangeToken": "cex_8Fsd9Kj3l2PQx0HnV7eTsU6cM4RbYaQ",
    "capabilityExchangeExpiresAt": "2026-03-16T13:50:21.000Z"
  }
}
```

Your receiver should verify the signature before parsing or acting on the payload.

## Step 4: Exchange The One-Time Delivery Token

Exchange the webhook token immediately:

```bash
curl -X POST "http://localhost:4000/v1/capabilities/exchange" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "exchangeToken": "cex_..."
  }'
```

Response:

```json
{
  "capabilityToken": "cap_8Fsd9Kj3l2PQx0HnV7eTsU6cM4RbYaQ",
  "expiresAt": "2026-03-16T14:00:21.000Z",
  "scope": {
    "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
    "action": "deployment.execute",
    "resource": {
      "type": "service",
      "id": "billing-api"
    }
  }
}
```

Important properties:

- exchange tokens are short-lived
- exchange tokens are single-use
- Approva stores only the exchange-token hash
- Approva still does not expose raw capability tokens through later reads

## Step 5: Use The Capability

Use the raw capability token for the protected action:

```bash
curl -X POST "http://localhost:4000/v1/capabilities/use" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "token": "cap_...",
    "action": "deployment.execute",
    "resource": {
      "type": "service",
      "id": "billing-api"
    },
    "params": {
      "environment": "production",
      "version": "2026.03.16-demo",
      "region": "eu-west-1"
    }
  }'
```

On success, Approva records `capability.used` in:

- the operational audit trail
- the immutable event log
- the ledger hash chain

## Step 6: Continue The Protected Action

After successful capability use, the machine client continues the protected action.

Examples:

- deploy the release
- execute the production migration
- issue the refund
- run the remote command

The important boundary is:

- Approva grants and records permission
- your agent or service performs the actual protected action

## Recommended Delivery Pattern

The recommended production-style pattern is:

1. backend or agent creates the request
2. human approves through the secure Approva approval page
3. Approva sends a signed webhook to the backend or agent
4. backend or agent exchanges the one-time token
5. backend or agent uses the capability and continues

This keeps:

- approval auth separate from machine auth
- opaque capability tokens intact
- raw capability-token delivery explicit and time-bounded

## Current Limitations

- the exchange token is only delivered on the approved webhook path
- there is no later raw-token recovery by request id or capability id
- some examples in this repo are still intentionally simpler and poll-based for illustration, but the canonical automated continuation path is the signed webhook plus exchange-token flow
- Approva does not yet implement richer workload identity or per-workload trust policies
- machine scopes are intentionally small in the current open-core runtime

## Recommended References

- [AI Agent Example](../examples/ai-agent/README.md)
- [Node Integration Guide](../docs/integration-node.md)
- [Service Accounts And API Keys](../docs/service-accounts.md)
- [Webhook Guide](../docs/webhooks.md)
- [CLI Guide](../docs/cli.md)
