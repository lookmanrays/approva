# Approva Slack Notifications

Approva can send approval notifications into Slack as an optional notification layer.

Slack is a notification channel only. It is not the approval security boundary.

Actual approval still happens in Approva through:

- the secure approval URL
- the approval access token
- passkey/WebAuthn approver authentication

## Current Scope

Supported message types:

- approval requested
- approval approved
- approval rejected
- approval expired

Current trigger points:

- pending approval creation
- approval decision recorded
- expiration sweep or first expiry transition

## Current Config Model

The current runtime supports organization-scoped Slack integrations, with env-based fallback
values for self-host and local development.

Today:

- the preferred path is `/console/integrations`, which stores one Slack integration per organization
- the API can still fall back to `APPROVA_SLACK_BOT_TOKEN` and `APPROVA_SLACK_CHANNEL_ID`
- the fallback path is practical for self-host, demos, and local development

This is practical for demos and early self-host usage.

## Required Env Vars

In [apps/api/.env.example](../apps/api/.env.example):

- `APPROVA_INTEGRATION_ENCRYPTION_KEY`
- `APPROVA_SLACK_BOT_TOKEN`
- `APPROVA_SLACK_CHANNEL_ID`

Notes:

- `APPROVA_INTEGRATION_ENCRYPTION_KEY` is required when Slack bot tokens are stored through organization integrations
- `APPROVA_SLACK_BOT_TOKEN` and `APPROVA_SLACK_CHANNEL_ID` are fallback values only
- if no organization integration and no fallback env values are configured, Approva logs the Slack message payload to the API console instead of sending it

## Slack App Setup

Recommended setup path:

1. Create a Slack app for your workspace
2. Add a bot user
3. Add the bot token scope:
   - `chat:write`
4. Install the app to the workspace
5. Copy the bot token into `APPROVA_SLACK_BOT_TOKEN`
6. Invite the bot to the target channel
7. Copy the channel id into `APPROVA_SLACK_CHANNEL_ID`

Notes:

- `chat:write` is enough when the bot is explicitly invited to the channel
- this integration does not require slash commands or interactive approval actions
- messages link back into Approva, but approval still occurs in Approva itself
- Slack bot tokens configured through `/console/integrations` are encrypted at rest and only decrypted inside the API process when a message is sent

## Message Content

Approval requested messages include:

- action
- resource
- risk level
- reason
- requested by
- approval link
- console detail link

Outcome messages include:

- action
- resource
- risk level
- reason
- requested by
- approver when available
- Approva links

## Local Testing

1. Configure either:

via env fallback:

```bash
APPROVA_INTEGRATION_ENCRYPTION_KEY=<32-byte-base64-or-64-char-hex>
APPROVA_SLACK_BOT_TOKEN=xoxb-...
APPROVA_SLACK_CHANNEL_ID=C0123456789
```

or through the console:

- sign in to the dashboard
- open `/console/integrations`
- configure Slack for the active organization

2. Start the stack:

```bash
pnpm dev
```

3. Create a high-risk approval request
4. Watch the Slack channel for:
   - approval requested
   - approval approved or rejected
   - approval expired if the request times out

Without Slack config, Approva logs the Slack message text to the API console for local verification.

## Implementation Notes

Slack delivery lives in:

- [slack.service.ts](../apps/api/src/modules/slack/slack.service.ts)

Notification orchestration lives in:

- [notification.service.ts](../apps/api/src/modules/notification/notification.service.ts)

Approval trigger wiring lives in:

- [approval-requests.service.ts](../apps/api/src/modules/approval-requests/approval-requests.service.ts)
