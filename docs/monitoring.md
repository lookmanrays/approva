# Approva Monitoring And Observability

Approva now includes a first production observability layer for the API:

- structured JSON logs
- request IDs
- liveness and readiness probes
- Prometheus-compatible counters
- optional Sentry error reporting

## Health Endpoints

Approva API exposes:

- `/health/live`
- `/health/ready`

Use them like this:

- `/health/live`
  confirms the process is up
- `/health/ready`
  confirms the API can reach Postgres and that required startup config is valid for the current runtime mode

Current readiness checks include:

- database connectivity
- startup config validation
- runtime mode sanity
- integration encryption key availability where required
- optional provider summaries for Slack and Resend

Optional provider issues are surfaced as warnings, not readiness blockers.

## Structured Logging

Every API log line is emitted as JSON and includes these fields:

- `request_id`
- `organization_id`
- `approval_request_id`
- `user_id`

When a field is not known for a given log line, Approva emits it as `null`.

Request IDs are generated for every request unless the caller already provides `X-Request-Id`.

Approva returns the final request ID in:

- `X-Request-Id` response header

Error responses also include:

- `requestId`

## Metrics

Approva exposes Prometheus-compatible counters at:

- `/v1/internal/metrics`

Current counters:

- `approva_approval_requests_created_total`
- `approva_approval_requests_approved_total`
- `approva_approval_requests_denied_total`
- `approva_policy_auto_approve_total`
- `approva_policy_reject_total`
- `approva_webhook_deliveries_total`
- `approva_webhook_failures_total`
- `approva_email_deliveries_total`
- `approva_email_failures_total`

These counters are process-local and intended for scrape-based aggregation in hosted deployments.

## Prometheus Setup

Example local check:

```bash
curl http://localhost:4000/v1/internal/metrics
```

Prometheus scrape example:

```yaml
scrape_configs:
  - job_name: approva-api
    metrics_path: /v1/internal/metrics
    static_configs:
      - targets:
          - localhost:4000
```

## Sentry

Set:

```bash
APPROVA_SENTRY_DSN=https://...
```

When configured, Approva initializes Sentry on API boot and reports server-side exceptions with request-scoped tags when available:

- `request_id`
- `organization_id`
- `approval_request_id`
- `user.id`

Current scope:

- exception capture for server-side API failures
- no distributed tracing or performance spans yet

## Deployment Notes

- keep `X-Request-Id` at your edge if you already use one
- point liveness probes at `/health/live`
- point readiness probes at `/health/ready`
- scrape `/v1/internal/metrics` from trusted network paths only
- use centralized log ingestion for the JSON API logs
- treat Sentry as optional and additive, not the only source of operational truth
