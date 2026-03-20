# Approva Email Delivery

Approva uses a shared transactional email layer so the open-core runtime does not need separate
email implementations for approval notifications and operational alerts.

## What It Covers

- approval notification emails

## Provider

The initial provider is Resend.

Provider-specific HTTP delivery is isolated behind the shared package in:

- [packages/email/src/index.ts](../packages/email/src/index.ts)

That package contains:

- the delivery provider abstraction
- the Resend provider
- the console/log fallback provider
- the current HTML/text templates

## Where Templates Live

Current templates are exported from:

- [packages/email/src/index.ts](../packages/email/src/index.ts)

Templates currently implemented:

- `buildApprovalNotificationEmail()`

## Trigger Points

Current live trigger points:

- approval notification:
  [apps/api/src/modules/notification/notification.service.ts](../apps/api/src/modules/notification/notification.service.ts)

## Required Env Vars

For real email delivery:

- `APPROVA_EMAIL_FROM`
- `APPROVA_RESEND_API_KEY`

Optional:

- `APPROVA_EMAIL_REPLY_TO`
- `APPROVA_APPROVAL_NOTIFICATION_TO`

## Resend Domain Verification

Before production delivery will work, the sender domain for `APPROVA_EMAIL_FROM` must be verified in Resend.

Example:

```bash
APPROVA_EMAIL_FROM="Approva <no-reply@updates.yourdomain.com>"
```

## Local Development Behavior

If `APPROVA_RESEND_API_KEY` is not configured:

- approval notification emails are logged to the NestJS API console

This fallback is intentional for local development and self-host trials.

## Approval Notification Recipients

Approval notification delivery is enabled when `APPROVA_APPROVAL_NOTIFICATION_TO` is set.

Use a comma-separated list:

```bash
APPROVA_APPROVAL_NOTIFICATION_TO=approver@example.com,ops@example.com
```

When a high-risk request becomes `pending`, Approva sends an email containing:

- action
- resource
- reason
- risk level
- approval link
