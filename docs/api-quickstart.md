# API Quickstart

## Create An Approval Request

```bash
curl -X POST "http://localhost:4000/v1/approval-requests" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deploy-req-001" \
  -d '{
    "externalRequestId": "ext-deploy-001",
    "requestedBy": {
      "system": "release-bot",
      "actorId": "run-42"
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
      "webhookUrl": "https://example.com/approval-webhook",
      "deliverCapabilityMode": "exchange_token"
    }
  }'
```

Expected behavior:

- Approva evaluates policy
- because the request is high risk, it becomes `pending`
- the response includes `approvalUrl`

## Secure Approval Flow

The secure approval flow uses two separate layers:

- approval access token:
  passed in the secure approval URL to scope which request can be viewed and decided
- approver authentication:
  a passkey-authenticated session cookie that proves who the approver is

The secure decision path is:

1. retrieve the request with `GET /v1/approval-requests/:id/secure-view?token=...`
2. authenticate the approver with the passkey endpoints
3. call secure approve or reject:
   - `POST /v1/approval-requests/:id/secure-approve?token=...`
   - `POST /v1/approval-requests/:id/secure-reject?token=...`

## Capability Verify Example

```bash
curl -X POST "http://localhost:4000/v1/capabilities/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<capability-token>",
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

The verification path checks:

- token exists
- token not expired
- token not revoked
- parent approval request is granted
- decision exists
- action exact match
- resource exact match
- params hash exact match

## Capability Use Example

```bash
curl -X POST "http://localhost:4000/v1/capabilities/use" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<capability-token>",
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

On success, Approva records `capability.used` through the full event chain.

## Capability Exchange Example

If the approval request was created with `callback.deliverCapabilityMode = exchange_token`, the approved webhook includes a short-lived one-time exchange token. Exchange it like this:

```bash
curl -X POST "http://localhost:4000/v1/capabilities/exchange" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "exchangeToken": "cex_..."
  }'
```

## Internal Ledger Verification

This endpoint is operator-facing and is useful for checking whether the deterministic ledger chain
still verifies correctly over the full chain or a specific sequence range.

Full-chain example:

```bash
curl -X POST "http://localhost:4000/v1/internal/ledger/verify"
```

Range example:

```bash
curl -X POST "http://localhost:4000/v1/internal/ledger/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "fromSeq": 10,
    "toSeq": 25
  }'
```

## Sample Webhook Payload

Example terminal-state payload:

```json
{
  "id": "3f01c902-3c06-4429-a6b5-96f2436fe8a8",
  "eventType": "approval_request.approved",
  "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
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

Current behavior:

- `approval_request.approved` can include a one-time exchange token when `deliverCapabilityMode = exchange_token`
- Approva still does not include the raw opaque capability token directly in the webhook payload
- later fetches do not reveal raw capability tokens by id

## Webhook Signature Model

Outgoing webhook requests include:

- `X-Approval-Timestamp`
- `X-Approval-Signature`

Signature format:

- signature header value: `v1=<hex_hmac_sha256>`
- signed input: `<timestamp>.<raw_json_payload>`
- secret: `WEBHOOK_SIGNING_SECRET`

Receiver-side verification example:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyApprovalWebhook(input: {
  rawBody: string;
  timestamp: string;
  signatureHeader: string;
  secret: string;
}) {
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex');

  const provided = input.signatureHeader.replace(/^v1=/, '');

  return (
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))
  );
}
```

## Related Docs

- [Agent Integration Guide](../docs/agent-integration.md)
- [Architecture](../docs/architecture.md)
- [AI Deploy Demo](../docs/demo-ai-deploy.md)
- [Node Integration Guide](../docs/integration-node.md)
- [Webhook Guide](../docs/webhooks.md)
