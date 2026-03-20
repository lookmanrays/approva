FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache libc6-compat
RUN corepack enable

WORKDIR /app

FROM base AS builder

ENV NODE_ENV=production
ENV APPROVA_RUNTIME_MODE=open-core
ENV APPROVA_SELF_HOST_MODE=true
ENV DATABASE_URL=postgresql://postgres:postgres@postgres:5432/approva?schema=public
ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:4000

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate
RUN pnpm build:packages
RUN pnpm --filter @approva/approval-ui build

FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["pnpm", "--filter", "@approva/approval-ui", "start"]
