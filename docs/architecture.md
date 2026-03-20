# Architecture

Approva Open Core is intentionally built as a modular monolith.

That keeps local development and self-host deployment straightforward while preserving clear
module boundaries around approval, policy, capability, machine auth, audit, and ledger concerns.

## Repository Shape

```text
apps/
  api/           NestJS API
  approval-ui/   Next.js approval UI and operator console
packages/
  cli/           machine-facing CLI
  sdk/           TypeScript SDK
  shared/        shared types and contracts
  email/         shared email templates and delivery helpers
prisma/
  schema.prisma
examples/
docs/
```

## Core Backend Modules

- `ApprovalRequestsModule`
- `AuthModule`
- `PolicyModule`
- `CapabilityModule`
- `MachineAuthModule`
- `IntegrationsModule`
- `AuditModule`
- `ImmutableLogModule`
- `LedgerModule`
- `WebhookModule`
- `ObservabilityModule`
- `RateLimitModule`

## Main Runtime Flow

1. A machine client creates an approval request.
2. The policy engine evaluates action, resource type, and risk level.
3. The request is auto-approved, rejected, or parked as `pending`.
4. A human opens the secure approval URL and authenticates with a passkey.
5. Approva records the decision and issues a scoped capability.
6. The client verifies or uses that capability.
7. Audit, immutable-log, and ledger entries record the sequence.

## Security Boundaries

- Approval auth:
  secure approval URL plus passkey-authenticated approver session.
- Machine auth:
  organization API keys, optionally attached to service accounts.
- Console access:
  self-host operator access scoped to the default organization and console proxy routes.

## Open-Core Console

In open-core mode, the operator console uses the default organization directly. The console is for
inspection, policy management, integrations, service accounts, API keys, ledger verification, and
demo workflows.
