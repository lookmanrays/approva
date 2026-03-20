#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/approva?schema=public}"
export APPROVA_RUNTIME_MODE="${APPROVA_RUNTIME_MODE:-open-core}"
export APPROVA_SELF_HOST_MODE="${APPROVA_SELF_HOST_MODE:-true}"
export APPROVA_DEFAULT_ORGANIZATION_NAME="${APPROVA_DEFAULT_ORGANIZATION_NAME:-Default Organization}"
export APPROVA_DEFAULT_ORGANIZATION_SLUG="${APPROVA_DEFAULT_ORGANIZATION_SLUG:-default}"
export APPROVAL_UI_BASE_URL="${APPROVAL_UI_BASE_URL:-http://localhost:3000}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4000}"
export APPROVA_INTERNAL_API_BASE_URL="${APPROVA_INTERNAL_API_BASE_URL:-http://localhost:4000}"
export PASSKEY_RP_NAME="${PASSKEY_RP_NAME:-Approva}"
export PASSKEY_RP_ID="${PASSKEY_RP_ID:-localhost}"
export PASSKEY_EXPECTED_ORIGINS="${PASSKEY_EXPECTED_ORIGINS:-http://localhost:3000}"
if [ -z "${APPROVAL_ACCESS_TOKEN_SECRET:-}" ]; then
  export APPROVAL_ACCESS_TOKEN_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
fi
if [ -z "${WEBHOOK_SIGNING_SECRET:-}" ]; then
  export WEBHOOK_SIGNING_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
fi

echo "Starting local Postgres..."
docker compose up -d postgres >/dev/null

echo "Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U postgres -d approva >/dev/null 2>&1; do
  sleep 1
done

if [ ! -f "${ROOT_DIR}/node_modules/.modules.yaml" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

echo "Generating Prisma client..."
pnpm prisma generate >/dev/null

echo "Applying database schema..."
pnpm db:push >/dev/null

SEED_LOG=$(mktemp)
trap 'rm -f "$SEED_LOG"' EXIT INT TERM

echo "Seeding local open-core data..."
if ! pnpm db:seed >"$SEED_LOG" 2>&1; then
  cat "$SEED_LOG"
  exit 1
fi

cat "$SEED_LOG"

APPROVAL_URL=$(sed -n 's/^Approval URL: //p' "$SEED_LOG" | tail -n 1)
APPROVER=$(sed -n 's/^Sample approver user: //p' "$SEED_LOG" | tail -n 1)

echo ""
echo "Approva local dev is ready."
echo "Next steps:"
echo "  - Console: http://localhost:3000/console/approvals"
echo "  - API docs: http://localhost:4000/docs"
if [ -n "$APPROVAL_URL" ]; then
  echo "  - Seeded approval: $APPROVAL_URL"
fi
if [ -n "$APPROVER" ]; then
  echo "  - Sample approver: $APPROVER"
fi
echo "  - Start here: open the approval URL, register a passkey, then approve the request."
echo ""
echo "Starting API and console..."
exec pnpm dev
