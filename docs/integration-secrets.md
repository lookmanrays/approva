# Approva Integration Secret Handling

Approva can encrypt sensitive organization-integration secrets before they are written to Postgres.

This is application-level encryption for self-hosted and local deployments. It hardens stored
integration data without changing the existing organization-scoped integrations model.

## Current Encrypted Fields

Approva currently encrypts these integration fields at rest:

- Slack integration `bot_token`
- webhook integration `secret`

These values are stored as encrypted envelopes inside `integrations.config_json`.

These values remain plain text:

- Slack `channel_id`
- webhook `url`
- email integration recipients

## Current Storage Model

When a sensitive integration field is created or replaced:

1. the API encrypts the value before writing it to Postgres
2. the API stores masked metadata alongside the encrypted value for console display
3. the raw secret is not returned by the integrations API

When the console reads integrations back:

- Slack and webhook secrets are represented as masked values or a generic configured state
- leaving the input blank during an update keeps the stored secret
- entering a new value replaces the stored secret

When the API actually sends Slack notifications or signed webhooks:

- the secret is decrypted only at send time
- the decrypted value stays inside the API process

## Required Env Var

Set this env var for the API:

- `APPROVA_INTEGRATION_ENCRYPTION_KEY`

Supported formats:

- 32-byte base64
- 64-character hex

Example:

```bash
APPROVA_INTEGRATION_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

## Rotation Caveat

The current open-core runtime uses one application-level encryption key per API deployment.

That means:

- all API instances in the same environment must share the same key
- changing the key without re-encrypting stored integration secrets will make existing encrypted values unreadable
- key rotation is a manual operational step in the current runtime

Recommended rotation approach:

1. keep the existing key active
2. read or re-enter current integration secrets
3. update them through `/console/integrations` after switching to the new key in a controlled maintenance window

Future improvements that are not implemented yet:

- multi-key decryption support
- automated re-encryption jobs
- KMS-backed key management
- per-tenant encryption keys

## Current Limitations

- only the currently designated secret fields are encrypted
- legacy plaintext integration rows created before this hardening pass are still readable; re-saving them through the current API will encrypt the secret field
- masking is intended for operator UX, not cryptographic proof of secret state

## Relevant Code Paths

- integration storage and public/runtime config shaping:
  [integrations.service.ts](../apps/api/src/modules/integrations/integrations.service.ts)
- encryption helper:
  [integration-secrets.service.ts](../apps/api/src/modules/integrations/integration-secrets.service.ts)
- console UI masking and replacement behavior:
  [console-integrations-page.tsx](../apps/approval-ui/components/console/console-integrations-page.tsx)
