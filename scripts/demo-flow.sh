#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${APPROVA_BASE_URL:-${AUTHON_BASE_URL:-http://localhost:4000}}"
UI_BASE_URL="${APPROVAL_UI_BASE_URL:-http://localhost:3000}"
ORGANIZATION_SLUG="${APPROVA_DEFAULT_ORGANIZATION_SLUG:-${AUTHON_DEFAULT_ORGANIZATION_SLUG:-default}}"
POLL_INTERVAL_SECONDS="${APPROVA_DEMO_POLL_INTERVAL_SECONDS:-2}"
TIMEOUT_SECONDS="${APPROVA_DEMO_TIMEOUT_SECONDS:-600}"

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

  args=(
    -fsS
    -X "$method"
    "$url"
    -H "Accept: application/json"
    -H "x-approva-organization-slug: ${ORGANIZATION_SLUG}"
  )

  local api_key="${APPROVA_API_KEY:-${AUTHON_API_KEY:-}}"
  if [[ -n "${api_key}" ]]; then
    args+=(-H "Authorization: Bearer ${api_key}")
  fi

  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi

  curl "${args[@]}"
}

function json_field() {
  local expression="$1"

  node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const expression = process.argv[1];
    const value = expression.split(".").reduce((current, segment) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      return current[segment];
    }, payload);

    if (value === undefined || value === null) {
      process.stdout.write("");
      process.exit(0);
    }

    process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
  ' "$expression"
}

require_command curl
require_command node

echo "Approva demo flow"
echo ""
echo "API: ${API_BASE_URL}"
echo "UI: ${UI_BASE_URL}"
echo "Organization: ${ORGANIZATION_SLUG}"
echo ""

READY_OUTPUT="$(curl -fsS "${API_BASE_URL}/health/ready")"
READY_STATUS="$(echo "${READY_OUTPUT}" | json_field "status")"
if [[ "${READY_STATUS}" != "ready" ]]; then
  echo "Approva is not ready yet. Start the stack with \`make dev\` first." >&2
  exit 1
fi

RUN_ID="$(node -e 'console.log(require("node:crypto").randomUUID())')"
VERSION_TAG="$(date -u +"%Y.%m.%d-demo")"

CREATE_RESPONSE="$(curl_json POST "${API_BASE_URL}/v1/approval-requests" "{
  \"requestedBy\": {
    \"system\": \"approva-demo\",
    \"actorId\": \"${RUN_ID}\"
  },
  \"action\": \"deployment.execute\",
  \"riskLevel\": \"high\",
  \"resource\": {
    \"type\": \"service\",
    \"id\": \"deploy-controller\"
  },
  \"params\": {
    \"environment\": \"production\",
    \"version\": \"${VERSION_TAG}\",
    \"demoRunId\": \"${RUN_ID}\"
  }
}")"

APPROVAL_REQUEST_ID="$(echo "${CREATE_RESPONSE}" | json_field "request.id")"
APPROVAL_STATUS="$(echo "${CREATE_RESPONSE}" | json_field "request.status")"
APPROVAL_URL="$(echo "${CREATE_RESPONSE}" | json_field "approvalUrl")"
CONSOLE_DETAIL_URL="${UI_BASE_URL}/console/approvals/${APPROVAL_REQUEST_ID}"

echo "Created demo approval request."
echo "Request ID: ${APPROVAL_REQUEST_ID}"
echo "Status: ${APPROVAL_STATUS}"
echo "Approval URL: ${APPROVAL_URL}"
echo "Console detail: ${CONSOLE_DETAIL_URL}"
echo ""
echo "What to do now:"
echo "1. Open the approval URL in your browser."
echo "2. Sign in to the console and add a passkey for a local user if you have not done that yet."
echo "3. Authenticate on the approval page with that user and approve the request."
echo "4. Keep this terminal open while Approva waits for the result."
echo ""

if [[ "${APPROVAL_STATUS}" == "approved" || "${APPROVAL_STATUS}" == "auto_approved" ]]; then
  echo "This request was approved immediately."
  echo "Open ${CONSOLE_DETAIL_URL} to inspect the event chain."
  exit 0
fi

if [[ "${APPROVAL_STATUS}" != "pending" ]]; then
  echo "The demo request did not enter a pending state." >&2
  exit 1
fi

echo "Waiting for approval"
STARTED_AT="$(date +%s)"

while true; do
  sleep "${POLL_INTERVAL_SECONDS}"
  STATUS_RESPONSE="$(curl_json GET "${API_BASE_URL}/v1/approval-requests/${APPROVAL_REQUEST_ID}")"
  CURRENT_STATUS="$(echo "${STATUS_RESPONSE}" | json_field "request.status")"

  case "${CURRENT_STATUS}" in
    pending)
      printf "."
      ;;
    approved|auto_approved)
      echo ""
      echo "Approved."
      echo "Result: ${CURRENT_STATUS}"
      echo "Open ${CONSOLE_DETAIL_URL} to inspect the audit trail, immutable events, and ledger."
      exit 0
      ;;
    rejected|expired)
      echo ""
      echo "Demo finished with status: ${CURRENT_STATUS}"
      echo "Open ${CONSOLE_DETAIL_URL} to inspect the recorded result."
      exit 1
      ;;
    *)
      echo ""
      echo "Unexpected status: ${CURRENT_STATUS}" >&2
      exit 1
      ;;
  esac

  NOW="$(date +%s)"
  if (( NOW - STARTED_AT >= TIMEOUT_SECONDS )); then
    echo ""
    echo "Timed out waiting for approval after ${TIMEOUT_SECONDS} seconds." >&2
    echo "You can keep watching the request in ${CONSOLE_DETAIL_URL}."
    exit 1
  fi
done
