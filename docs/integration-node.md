# Node Integration Guide

This guide shows the first practical backend integration path for Approva using the example app in:

- [examples/node-deploy-agent](../examples/node-deploy-agent)

Canonical reference:

- [Agent Integration Guide](../docs/agent-integration.md)

## What The Example Does

The example simulates a deploy agent that wants to execute:

- action: `deployment.execute`
- resource: `service/billing-api`
- params:
  - `environment = production`
  - `version = 2026.03.16-demo`
  - `region = eu-west-1`

The flow is:

1. the agent requests approval from Approva
2. Approva returns a pending approval request and secure approval URL
3. a human opens the approval page and approves with a passkey
4. Approva sends a signed webhook to the example app with a one-time capability exchange token
5. the example exchanges that token through `POST /v1/capabilities/exchange`
6. the example calls `POST /v1/capabilities/use`
7. the example then simulates `deployment executed`

## Exact Local Steps

### 1. Start Approva

From the repo root:

```bash
docker compose up -d postgres

cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/approval-ui/.env.local.example apps/approval-ui/.env.local

pnpm install
pnpm prisma generate
pnpm db:push
pnpm db:seed
pnpm dev
```

### 2. Start The Example Agent

In another terminal:

```bash
pnpm --filter @approva-example/node-deploy-agent dev
```

Open:

- [http://localhost:4100](http://localhost:4100)

### 3. Create A Deployment Approval Request

Use the example page button or:

```bash
curl -X POST http://localhost:4100/request-approval
```

The response includes:

- `approvalRequestId`
- `approvalUrl`

### 4. Approve With Passkey

Open the `approvalUrl`, then:

1. register a passkey locally if needed
2. authenticate with the passkey
3. approve the request

### 5. Observe The Webhook

The example app receives:

- `approval_request.approved`
- `approval_request.rejected`
- `approval_request.expired`

It verifies the webhook signature before processing.

### 6. Continue With Capability Exchange And Use

When the request is approved in `exchange_token` mode, the webhook payload includes:

- `capabilityId`
- `capabilityExchangeToken`
- `capabilityExchangeExpiresAt`

The example then:

1. calls `POST /v1/capabilities/exchange`
2. receives the raw opaque capability token once
3. calls `POST /v1/capabilities/use`
4. simulates `deployment executed`

## Backend Request Example

Create an approval request directly against Approva:

```bash
curl -X POST "http://localhost:4000/v1/approval-requests" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: node-deploy-agent-001" \
  -d '{
    "externalRequestId": "node-deploy-agent-001",
    "requestedBy": {
      "system": "node-deploy-agent",
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
      "webhookUrl": "http://localhost:4100/webhooks/approva",
      "deliverCapabilityMode": "exchange_token"
    }
  }'
```

Equivalent SDK example:

```ts
import { ApprovalClient } from '@approva/sdk';

const approva = new ApprovalClient({
  baseUrl: 'http://localhost:4000',
  apiKey: process.env.APPROVA_API_KEY,
});

const approval = await approva.requestApproval(
  {
    externalRequestId: 'node-deploy-agent-001',
    requestedBy: {
      system: 'node-deploy-agent',
      actorId: 'billing-api-release-runner',
    },
    action: 'deployment.execute',
    riskLevel: 'high',
    resource: {
      type: 'service',
      id: 'billing-api',
    },
    params: {
      environment: 'production',
      version: '2026.03.16-demo',
      region: 'eu-west-1',
    },
    callback: {
      webhookUrl: 'http://localhost:4100/webhooks/approva',
      deliverCapabilityMode: 'exchange_token',
    },
  },
  {
    idempotencyKey: 'node-deploy-agent-001',
  },
);

console.log(approval.request.id);
console.log(approval.approvalUrl);
```

## Capability Use Example

```bash
curl -X POST "http://localhost:4000/v1/capabilities/use" \
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

## Capability Exchange Example

```bash
curl -X POST "http://localhost:4000/v1/capabilities/exchange" \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "exchangeToken": "cex_..."
  }'
```

## Current Product Constraints

- approval access token and approver passkey authentication are separate layers
- capability tokens are opaque and only `sha256(token)` is stored by Approva
- later fetches still do not reveal raw capability tokens by id
- the supported machine continuation path is the short-lived single-use exchange token delivered on the approved webhook

## Related Docs

- [Agent Integration Guide](../docs/agent-integration.md)
- [Webhook Guide](../docs/webhooks.md)
- [API Quickstart](../docs/api-quickstart.md)
