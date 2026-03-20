# DevOps Script Example

This example shows a shell-first Approva flow for operators and scripts.

Files:

- [deploy-with-approva.sh](./deploy-with-approva.sh)

## Run

From the repo root:

```bash
pnpm install
pnpm cli:build
```

Then:

```bash
export APPROVA_BASE_URL=http://localhost:4000
export APPROVA_API_KEY=approva_sk_...

bash examples/devops-script/deploy-with-approva.sh
```

Optional continuation if you already have a raw capability token from a valid exchange flow:

```bash
export APPROVA_CAPABILITY_TOKEN=cap_...
bash examples/devops-script/deploy-with-approva.sh
```

The script is intentionally simple and poll-based. It stops cleanly if no raw capability token is available, and the recommended fully automated path is Approva's signed webhook plus `exchange_token` delivery mode.

Canonical reference:

- [Agent Integration Guide](../../docs/agent-integration.md)
