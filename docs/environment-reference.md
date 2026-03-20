# Environment Reference

The public repository is documented around open-core self-host usage.

Reference templates:

- [../.env.example](../.env.example)
- [../apps/api/.env.example](../apps/api/.env.example)
- [../apps/approval-ui/.env.local.example](../apps/approval-ui/.env.local.example)
- [../deploy/env/open-core.self-host.root.env.example](../deploy/env/open-core.self-host.root.env.example)
- [../deploy/env/open-core.self-host.api.env.example](../deploy/env/open-core.self-host.api.env.example)
- [../deploy/env/open-core.self-host.ui.env.example](../deploy/env/open-core.self-host.ui.env.example)

## Root

Required:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/approva?schema=public
APPROVA_RUNTIME_MODE=open-core
APPROVA_SELF_HOST_MODE=true
APPROVA_DEFAULT_ORGANIZATION_NAME="Default Organization"
APPROVA_DEFAULT_ORGANIZATION_SLUG=default
```

## API

Required:

```bash
PORT=4000
APPROVAL_UI_BASE_URL=http://localhost:3000
APPROVAL_ACCESS_TOKEN_SECRET=change-me-approval-access
WEBHOOK_SIGNING_SECRET=change-me-webhook
PASSKEY_RP_NAME=Approva
PASSKEY_RP_ID=localhost
PASSKEY_EXPECTED_ORIGINS=http://localhost:3000
```

Useful optional settings:

- `APPROVA_API_ALLOWED_ORIGINS`
- `APPROVA_RATE_LIMIT_*`
- `APPROVA_INTEGRATION_ENCRYPTION_KEY`
- `APPROVA_EMAIL_FROM`
- `APPROVA_RESEND_API_KEY`
- `APPROVA_SLACK_BOT_TOKEN`
- `APPROVA_SLACK_CHANNEL_ID`
- `APPROVA_SENTRY_DSN`

## UI

Required:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
APPROVA_RUNTIME_MODE=open-core
APPROVA_SELF_HOST_MODE=true
```

Useful optional settings:

- `APPROVA_INTERNAL_API_BASE_URL`
- `NEXT_PUBLIC_SAMPLE_APPROVER_EMAIL`
- `NEXT_PUBLIC_APPROVA_RELEASE`
- `APPROVA_EMAIL_FROM`
- `APPROVA_RESEND_API_KEY`

## Notes

- Open-core is the default runtime when no valid mode is configured.
- For non-localhost deployments, set final HTTPS origins before testing passkeys.
