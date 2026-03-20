# n8n Integration Blueprint

This document shows how Approva fits into an n8n workflow today, without requiring a dedicated Approva n8n node yet.

The goal is practical adoption:

- a workflow step wants to perform a risky action
- Approva is asked to create an approval request
- execution pauses until Approva sends a decision webhook
- the workflow continues on approval, or exits on rejection or expiry

## Where Approva Fits In An n8n Workflow

Approva belongs between:

- an autonomous decision/action planning step
- and the actual execution of a risky external action

Typical placement in n8n:

1. an AI or automation node decides to perform something risky
2. an HTTP Request node calls `POST /v1/approval-requests`
3. the workflow stores `approvalRequestId`, `externalRequestId`, and `approvalUrl`
4. execution pauses
5. an Approva webhook later signals `approved`, `rejected`, or `expired`
6. the workflow resumes on the appropriate branch

In practice, the clean MVP mapping is:

- workflow A creates the approval request and ends after persisting correlation data
- workflow B starts from an Approva webhook and resumes the business flow

That is usually simpler than trying to keep one long-running workflow execution open.

## Practical n8n Pattern

### Flow A: Request Approval

Suggested n8n steps:

1. AI / business logic step decides to execute a risky action
2. Set node builds the Approva request payload
3. HTTP Request node calls `POST /v1/approval-requests`
4. Data Store / database node persists:
   - `approvalRequestId`
   - `externalRequestId`
   - original workflow context
   - intended next action
   - any correlation key needed to resume later
5. Notification / Slack / email node can surface `approvalUrl`
6. workflow ends in `waiting_for_approva_decision`

### Flow B: Continue On Decision Webhook

Suggested n8n steps:

1. Webhook node receives Approva event
2. Code node verifies `X-Approval-Signature` and `X-Approval-Timestamp`
3. Switch node branches on:
   - `approval_request.approved`
   - `approval_request.rejected`
   - `approval_request.expired`
4. Data Store / database node loads the original workflow context using `approvalRequestId`
5. Approved branch continues the protected execution path
6. Rejected branch notifies / closes / marks denied
7. Expired branch notifies / times out / optionally creates a fresh approval path

## How To Create An Approval Request From n8n

Use an HTTP Request node:

- Method: `POST`
- URL: `http://localhost:4000/v1/approval-requests`
- Headers:
  - `Content-Type: application/json`
  - `Idempotency-Key: {{$json.externalRequestId}}`

Example body:

```json
{
  "externalRequestId": "n8n-deploy-001",
  "requestedBy": {
    "system": "n8n",
    "actorId": "workflow-ai-deploy"
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
  "callbackUrl": "https://your-n8n.example/webhook/approva-decision"
}
```

Expected response shape:

```json
{
  "request": {
    "id": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
    "externalRequestId": "n8n-deploy-001",
    "requestedBy": {
      "system": "n8n",
      "actorId": "workflow-ai-deploy"
    },
    "action": "deployment.execute",
    "resource": {
      "type": "service",
      "id": "billing-api"
    },
    "params": {
      "environment": "production",
      "version": "2026.03.16-demo",
      "region": "eu-west-1"
    },
    "paramsHash": "6c4b1b7e1e7f2af18cb1d65cbfa6ab7ef1f0e8f14986cbfa8b3c0c14576a4a7c",
    "riskLevel": "high",
    "status": "pending",
    "callbackUrl": "https://your-n8n.example/webhook/approva-decision",
    "policyResult": {
      "decision": "requires_approval",
      "requiresApproval": true,
      "matchedRules": [
        "risk.high_or_critical"
      ],
      "reasons": [
        "Risk level high requires approval."
      ],
      "evaluatedAt": "2026-03-16T13:40:00.000Z"
    },
    "expiresAt": "2026-03-17T13:40:00.000Z",
    "decidedAt": null,
    "createdAt": "2026-03-16T13:40:00.000Z",
    "updatedAt": "2026-03-16T13:40:00.000Z",
    "latestDecision": null,
    "capability": null
  },
  "approvalUrl": "http://localhost:3000/approval-requests/7e1c48b5-708d-402a-ae32-d5ca90b935ff?token=aat_...",
  "idempotentReplay": false
}
```

## How To Pause Until Decision

Approva does not directly "pause n8n". The practical mapping is externalized pause/resume.

Recommended MVP approach:

- after `POST /v1/approval-requests`, persist enough context to resume later
- return success from the current workflow
- let a second n8n workflow resume from the Approva webhook

Why this is the best fit today:

- it avoids long-running workflow state
- it matches Approva’s webhook-first continuation model
- it keeps correlation explicit through `approvalRequestId` or `externalRequestId`

If you want a single-visual-flow experience later, an eventual Approva n8n node could hide this split.

## How To Continue After Approval

When Approva sends `approval_request.approved`, the n8n webhook workflow should:

1. verify the webhook signature
2. load the original execution context by `approvalRequestId`
3. decide whether the downstream action needs a capability token
4. if needed, exchange the one-time delivery token for the raw capability token
5. continue the protected branch

### Current Capability Delivery Model

When the approval request was created with `callback.deliverCapabilityMode = exchange_token`, approved webhooks include:

- `approvalRequestId`
- `status`
- `capabilityId`
- `capabilityExchangeToken`
- `capabilityExchangeExpiresAt`

They still do **not** include the raw opaque capability token directly.

That means an n8n workflow can:

- use the approval signal itself to continue a downstream action that does not require the raw capability token in n8n
- or exchange the short-lived one-time delivery token through `POST /v1/capabilities/exchange` before calling `POST /v1/capabilities/use`

What it still cannot do:

- fetch the raw capability token later from Approva
- derive the token from `capabilityId`

## How To Map Approva Events Into Workflow Continuation

Suggested n8n Switch node mapping:

- `approval_request.approved`
  continue the protected path
- `approval_request.rejected`
  mark the work as denied and notify the requester
- `approval_request.expired`
  mark the work as timed out and optionally generate a fresh approval request

### Approved Event Example

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

### Rejected Event Example

```json
{
  "id": "f18b7341-5bb4-4ddf-8ab8-e2ddc4c1f6de",
  "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
  "eventType": "approval_request.rejected",
  "occurredAt": "2026-03-16T13:47:03.000Z",
  "payload": {
    "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
    "status": "rejected"
  }
}
```

### Expired Event Example

```json
{
  "id": "bc3497f8-4824-4a06-8501-ae5d3d62fa6a",
  "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
  "eventType": "approval_request.expired",
  "occurredAt": "2026-03-17T13:40:01.000Z",
  "payload": {
    "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
    "status": "expired"
  }
}
```

## Capability Use Example

After exchanging the one-time delivery token, use an HTTP Request node to present the raw capability token:

- Method: `POST`
- URL: `http://localhost:4000/v1/capabilities/use`

Example body:

```json
{
  "token": "cap_8Fsd9Kj3l2PQx0HnV7eTsU6cM4RbYaQ",
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
}
```

Example success response:

```json
{
  "valid": true,
  "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff"
}
```

Example mismatch response:

```json
{
  "valid": false,
  "approvalRequestId": "7e1c48b5-708d-402a-ae32-d5ca90b935ff",
  "reason": "Capability verification failed.",
  "invalidReason": {
    "code": "params_mismatch",
    "message": "Capability params hash does not match."
  }
}
```

## Suggested Approva n8n Node Design

An eventual Approva n8n node could expose three operations:

### 1. Create Approval Request

Inputs:

- action
- resource type
- resource id
- risk level
- params
- callback URL
- external request id
- requested by system / actor

Outputs:

- approval request id
- status
- approval URL
- expires at
- policy result

### 2. Wait For Decision

Behavior:

- persists correlation state
- exposes a webhook or resume token
- resumes when Approva sends `approved`, `rejected`, or `expired`

Outputs:

- event type
- approval request id
- status
- capability id if present

### 3. Verify / Use Capability

Inputs:

- raw capability token
- action
- resource binding
- params

Outputs:

- valid
- approval request id
- structured invalid reason when rejected

## MVP Implementation Note

What exists today:

- `POST /v1/approval-requests`
- signed terminal-state webhooks
- `POST /v1/capabilities/verify`
- `POST /v1/capabilities/use`
- passkey-secured human approval flow

What is still conceptual for n8n:

- a native Approva n8n node
- built-in workflow pause/resume abstraction
- automatic raw capability-token delivery into the resumed n8n path

The recommended implementation today is:

- HTTP Request node for create/use
- Webhook node for decision events
- Code node for signature verification
- Data Store or DB node for pause/resume correlation

## Lightweight Pseudo-Workflow

```json
{
  "workflow": "AI deploy with Approva approval",
  "flowA": [
    "AI planning step",
    "Build Approva approval payload",
    "POST /v1/approval-requests",
    "Persist approvalRequestId + execution context",
    "Stop and wait for webhook"
  ],
  "flowB": [
    "Receive Approva webhook",
    "Verify signature",
    "Load execution context by approvalRequestId",
    "Switch on eventType",
    "approved -> continue",
    "rejected -> notify and stop",
    "expired -> timeout path"
  ]
}
```

## Summary

The right mental model for n8n is:

- Approva is the approval checkpoint
- n8n handles orchestration and persistence of workflow context
- Approva webhooks resume the orchestration
- capability use is strict and only possible when the raw token is legitimately available

This keeps the integration honest to the current Approva product model while leaving a clean path to a future native n8n node.
