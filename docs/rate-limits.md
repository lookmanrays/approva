# Approva Rate Limits And Abuse Protection

Approva includes production-safe rate limiting and outbound webhook replay protection for the
open-core runtime.

The implementation is application-level and Postgres-backed so counters remain durable across multiple API instances.

## Global API Limits

Default limits:

- public endpoints:
  `60 requests / minute / IP`
- authenticated dashboard-backed endpoints:
  `300 requests / minute / dashboard user`
- approval endpoints:
  `20 requests / minute / IP`

Approval endpoints currently include the `/v1/approval-requests/*` surface, including secure approval views and secure approve/reject actions.

## Organization-Scoped Limits

Approva also enforces per-organization limits for:

- approval request creation
- capability verification and use
- webhook delivery retries

Default org limits:

- approval request creation:
  `120 / minute / organization`
- capability verification or use:
  `600 / minute / organization`
- webhook retries:
  `120 / minute / organization`

## Webhook Replay Protection

Approva records a replay window for successfully delivered webhook events.

If the same event is attempted again for the same target within the replay window, Approva blocks it and returns a duplicate outcome instead of re-sending the payload.

Current default replay window:

- `300 seconds`

This protection applies to:

- approval callback webhooks
- organization integration webhooks

It does not replace receiver-side signature validation. Consumers should still verify:

- `X-Approval-Signature`
- `X-Approval-Timestamp`

## Headers

When the global middleware applies, Approva returns:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`
- `RateLimit-Policy`
- `Retry-After` when blocked

For easier debugging, Approva also returns:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Environment Variables

Required core switches:

- `APPROVA_RATE_LIMIT_ENABLED`
- `APPROVA_RATE_LIMIT_GLOBAL`
- `APPROVA_RATE_LIMIT_AUTHENTICATED`

Optional overrides:

- `APPROVA_RATE_LIMIT_APPROVAL`
- `APPROVA_RATE_LIMIT_ORG_APPROVAL_CREATION`
- `APPROVA_RATE_LIMIT_ORG_CAPABILITY_VERIFICATION`
- `APPROVA_RATE_LIMIT_ORG_WEBHOOK_RETRIES`
- `APPROVA_WEBHOOK_REPLAY_WINDOW_SECONDS`

## Local Notes

- local test environments can set `APPROVA_RATE_LIMIT_ENABLED=false`
- rate limiting is API-only
- approval auth, console access, and policy routing remain unchanged
