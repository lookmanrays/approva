# Open-Core Runtime

Approva Open Core defaults to:

```bash
APPROVA_RUNTIME_MODE=open-core
```

## Open-Core Mode

Open-core mode is the supported public-repo runtime.

- creates or resolves the default organization automatically
- allows direct console access
- keeps passkey approval auth separate from operator console access
- enables policies, integrations, service accounts, organization API keys, audit, immutable log, and ledger verification

The public repository is documented and supported around `APPROVA_RUNTIME_MODE=open-core`.

`APPROVA_SELF_HOST_MODE=true` still resolves to open-core mode when `APPROVA_RUNTIME_MODE` is not
set, but `APPROVA_RUNTIME_MODE=open-core` is the preferred setting.
