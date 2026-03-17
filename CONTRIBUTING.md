# Contributing

Thanks for helping improve Approva Open Core.

## Before You Start

- keep changes scoped and practical
- do not redesign the product as part of unrelated work
- do not add hosted-cloud-only features to this repository
- if a change only makes sense for the hosted product, it should live separately

## Local Setup

Create local env files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/approval-ui/.env.local.example apps/approval-ui/.env.local
```

Run local development:

```bash
make dev
```

Run the Docker self-host stack:

```bash
make start
```

Useful commands:

```bash
pnpm build
make smoke
pnpm cli:build
```

## Coding Expectations

- preserve the existing product shape and open-core behavior
- keep documentation, examples, and naming aligned with self-hosted open-core usage
- avoid leaving dead routes, broken imports, or half-removed code paths
- prefer focused changes with clear rationale
- update docs when the user-facing behavior changes

## Proposing Changes

1. Open an issue or discussion when the change is large, risky, or ambiguous.
2. Keep pull requests focused on a single problem when possible.
3. Describe what changed, why it changed, and how you tested it.
4. Include screenshots or terminal output when UI or operator workflows are affected.
5. Expect pull requests to pass GitHub Actions CI for install, Prisma generate, typecheck, and build.

## Pull Request Checklist

Before opening a PR, make sure you have:

- run the relevant local checks for your change
- updated docs or examples if needed
- kept the change within the scope of Approva Open Core
- avoided introducing hosted-commercial or cloud-operations-only surfaces

## License

By submitting a contribution, you agree that your contributions will be licensed under the
Approva License v1 that covers this repository.
