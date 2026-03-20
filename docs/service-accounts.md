# Service Accounts And API Keys

Approva supports machine-facing authentication for agents, CI/CD systems, scripts, and backend services without requiring human console login.

This surface is intentionally separate from:

- approval auth
  used for human approval decisions with secure approval URLs and passkeys
- console access
  used for local operator views and control-plane routes

Canonical machine-flow reference:

- [Agent Integration Guide](../docs/agent-integration.md)

## Model

### Service accounts

Service accounts represent a machine identity inside one organization.

Use them when you want Approva audit history to show a stable actor such as:

- `Deploy agent`
- `Billing automation`
- `Refund processor`

Fields stored today:

- `id`
- `organization_id`
- `name`
- `description`
- `created_at`
- `revoked_at`

### Organization API keys

API keys are bearer credentials that optionally belong to a service account.

Fields stored today:

- `id`
- `organization_id`
- `service_account_id`
- `name`
- `key_prefix`
- `key_hash`
- `scopes`
- `last_used_at`
- `revoked_at`
- `created_at`

Important behavior:

- raw API keys are shown only once at creation time
- Approva stores only `sha256(raw_key)` in Postgres
- revoked keys stop working immediately
- if a linked service account is revoked, its keys stop working immediately

## Token Format

Machine clients authenticate with:

```http
Authorization: Bearer approva_sk_...
```

Approva generates keys with cryptographically secure random bytes and never stores the raw value after creation.

## Current Scopes

- `approval_requests:create`
- `approval_requests:read`
- `capabilities:verify`
- `capabilities:use`
- `webhooks:manage`

The core machine-facing product path in this repo is:

- create approval request
- read approval request
- exchange one-time capability delivery tokens after approval
- verify capability
- use capability

The officially recommended continuation path is:

- create the request with `deliverCapabilityMode = exchange_token`
- verify the signed approved webhook
- exchange the one-time delivery token
- use the returned opaque capability token

## Supported Endpoints

Machine-authenticated calls are currently supported for:

- `POST /v1/approval-requests`
- `GET /v1/approval-requests/:id`
- `POST /v1/capabilities/exchange`
- `POST /v1/capabilities/verify`
- `POST /v1/capabilities/use`

Management endpoints for console/admin usage:

- `GET /v1/service-accounts`
- `POST /v1/service-accounts`
- `POST /v1/service-accounts/:id/revoke`
- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `POST /v1/api-keys/:id/revoke`

## Example Flow

### 1. Create a service account in the console

Open:

- `http://localhost:3000/console/service-accounts`

Create a service account such as `Deploy agent`.

### 2. Create an API key

Open:

- `http://localhost:3000/console/api-keys`

Create a key with:

- name: `Deploy agent production key`
- service account: `Deploy agent`
- scopes:
  - `approval_requests:create`
  - `approval_requests:read`
  - `capabilities:use`
  - `capabilities:verify`

Copy the raw key immediately. Approva does not reveal it again.

### 3. Create an approval request with the API key

```bash
curl -X POST http://localhost:4000/v1/approval-requests \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "requestedBy": {
      "system": "deploy-agent",
      "actorId": "run-2026-03-16-001"
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

### 4. Receive the approved webhook and exchange the one-time token

When the request is approved in `exchange_token` mode, the signed `approval_request.approved` webhook includes:

- `capabilityId`
- `capabilityExchangeToken`
- `capabilityExchangeExpiresAt`

Exchange it immediately:

```bash
curl -X POST http://localhost:4000/v1/capabilities/exchange \
  -H "Authorization: Bearer approva_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "exchangeToken": "cex_..."
  }'
```

The response includes:

- `capabilityToken`
- `expiresAt`
- `scope`

### 5. Read the approval request

```bash
curl http://localhost:4000/v1/approval-requests/<request-id> \
  -H "Authorization: Bearer approva_sk_..."
```

### 6. Use a granted capability

```bash
curl -X POST http://localhost:4000/v1/capabilities/use \
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

## Audit Behavior

When a machine-authenticated client creates an approval request or uses a capability:

- the event chain records actor type `machine`
- Approva records the API key id and prefix in event metadata
- if a service account is linked, Approva records that service account identity as well

This makes the audit trail easier to read during demos and investigations.

## Console Routes

- `/console/service-accounts`
- `/console/api-keys`

These routes are operator/admin-facing surfaces. They do not replace the human approval UI.

## Current Limitations

- API key scopes are intentionally small in the current open-core runtime
- there is no per-key IP allowlist or expiration model yet
- there is no per-service-account policy routing or workload identity exchange yet
- console access, approval auth, and machine auth are separate systems by design
- open-core mode can still use these management pages through the default organization path
- exchange tokens are short-lived and single-use; they are a delivery path for the raw opaque capability token, not a second reusable capability
