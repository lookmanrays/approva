#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${APPROVA_SMOKE_API_BASE_URL:-${AUTHON_SMOKE_API_BASE_URL:-${APPROVA_BASE_URL:-${AUTHON_BASE_URL:-http://localhost:4000}}}}"
UI_BASE_URL="${APPROVA_SMOKE_UI_BASE_URL:-${AUTHON_SMOKE_UI_BASE_URL:-http://localhost:3000}}"

function section() {
  printf '\n== %s ==\n' "$1"
}

function require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

function curl_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local -a args

  args=(-fsS -X "$method" "$url")

  local api_key="${APPROVA_API_KEY:-${AUTHON_API_KEY:-}}"
  if [[ -n "${api_key}" ]]; then
    args+=(-H "Authorization: Bearer ${api_key}")
  fi

  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  else
    args+=(-H "Accept: application/json")
  fi

  curl "${args[@]}"
}

require_command curl
require_command node

section "Runtime"
echo "API: ${API_BASE_URL}"
echo "UI: ${UI_BASE_URL}"
echo "Mode: open-core"

section "Health endpoints"
LIVE_OUTPUT="$(curl -fsS "${API_BASE_URL}/health/live")"
READY_OUTPUT="$(curl -fsS "${API_BASE_URL}/health/ready")"
echo "${LIVE_OUTPUT}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  if (payload.status !== "ok") {
    console.error("Liveness failed:", payload);
    process.exit(1);
  }
  console.log("Liveness OK");
'
echo "${READY_OUTPUT}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  if (payload.status !== "ready") {
    console.error("Readiness failed:", payload);
    process.exit(1);
  }
  console.log("Readiness OK");
'

section "Console check"
echo "Open ${UI_BASE_URL}/console/approvals and confirm the console loads directly."

section "Metrics endpoint"
METRICS_OUTPUT="$(curl -fsS "${API_BASE_URL}/v1/internal/metrics")"
if [[ "${METRICS_OUTPUT}" == *"approva_approval_requests_created_total"* ]]; then
  echo "Metrics endpoint responded with Prometheus counters."
else
  echo "Metrics endpoint did not include expected counters." >&2
  exit 1
fi

section "Ledger verify endpoint"
LEDGER_OUTPUT="$(curl_json POST "${API_BASE_URL}/v1/internal/ledger/verify" '{}')"
echo "${LEDGER_OUTPUT}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!payload.valid) {
    console.error("Ledger verify failed:", payload);
    process.exit(1);
  }
  console.log(`Ledger verified (${payload.checkedEntries} entries checked).`);
'

section "Create approval request"
CREATE_RESPONSE="$(curl_json POST "${API_BASE_URL}/v1/approval-requests" '{
  "requestedBy": {
    "system": "smoke-test",
    "actorId": "smoke-test-runner"
  },
  "action": "deployment.execute",
  "riskLevel": "high",
  "resource": {
    "type": "service",
    "id": "billing-api"
  },
  "params": {
    "environment": "production",
    "version": "2026.03.16-smoke"
  }
}')"

APPROVAL_REQUEST_ID="$(echo "${CREATE_RESPONSE}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(payload.request.id);
')"
APPROVAL_STATUS="$(echo "${CREATE_RESPONSE}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(payload.request.status);
')"
APPROVAL_URL="$(echo "${CREATE_RESPONSE}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(payload.approvalUrl ?? "");
')"
AUTO_CAPABILITY_TOKEN="$(echo "${CREATE_RESPONSE}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(payload.capability?.token ?? "");
')"

echo "Approval request ID: ${APPROVAL_REQUEST_ID}"
echo "Initial status: ${APPROVAL_STATUS}"
if [[ -n "${APPROVAL_URL}" ]]; then
  echo "Approval URL: ${APPROVAL_URL}"
fi

if [[ "${APPROVAL_STATUS}" == "pending" ]]; then
  section "Manual passkey approval"
  cat <<EOF
1. Open the approval URL above
2. Register or authenticate with a passkey
3. Approve the request
4. Capture the issued capability token from the approval page if you want to test /v1/capabilities/use
EOF
  read -r -p "Press Enter after the request has been approved..."
fi

section "Poll approval status"
FINAL_RESPONSE="$(curl_json GET "${API_BASE_URL}/v1/approval-requests/${APPROVAL_REQUEST_ID}")"
FINAL_STATUS="$(echo "${FINAL_RESPONSE}" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(payload.request.status);
')"
echo "Current status: ${FINAL_STATUS}"

if [[ "${FINAL_STATUS}" != "approved" && "${FINAL_STATUS}" != "auto_approved" ]]; then
  echo "Approval did not reach an approved state." >&2
  exit 1
fi

CAPABILITY_TOKEN="${AUTO_CAPABILITY_TOKEN}"
if [[ -z "${CAPABILITY_TOKEN}" ]]; then
  read -r -p "Paste the capability token from the approval page to verify/use it (or press Enter to skip): " CAPABILITY_TOKEN
fi

if [[ -n "${CAPABILITY_TOKEN}" ]]; then
  section "Capability use"
  USE_RESPONSE="$(curl_json POST "${API_BASE_URL}/v1/capabilities/use" '{
    "token": "'"${CAPABILITY_TOKEN}"'",
    "action": "deployment.execute",
    "resource": {
      "type": "service",
      "id": "billing-api"
    },
    "params": {
      "environment": "production",
      "version": "2026.03.16-smoke"
    }
  }')"
  echo "${USE_RESPONSE}" | node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    if (!payload.valid) {
      console.error("Capability use failed:", payload);
      process.exit(1);
    }
    console.log(`Capability used for approval request ${payload.approvalRequestId}.`);
  '
else
  section "Capability use skipped"
  echo "No capability token was provided, so the capability use check was skipped."
fi

section "Smoke test summary"
cat <<EOF
- health endpoints: verified
- console access: open-core
- approval request creation: verified
- passkey approval: manual confirmation required
- capability use: ${CAPABILITY_TOKEN:+verified}${CAPABILITY_TOKEN:-skipped}
- metrics endpoint: verified
- ledger verify: verified
EOF
