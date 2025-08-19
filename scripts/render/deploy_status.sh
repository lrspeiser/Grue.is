#!/usr/bin/env bash
# Show latest deploy(s) for a Render service.
# Requires: RENDER_API_TOKEN, SERVICE_ID
set -euo pipefail

: "${RENDER_API_TOKEN:?Set RENDER_API_TOKEN}"
: "${SERVICE_ID:?Set SERVICE_ID}"

LIMIT=${LIMIT:-3}

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not found. Please install jq" >&2
  exit 1
fi

api_json() {
  curl -sS -H "Authorization: Bearer $RENDER_API_TOKEN" -H "Accept: application/json" "$@"
}

URL="https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=$LIMIT"
resp=$(api_json "$URL")

# Render returns an array of deploys (most recent first)
echo "$resp" | jq -r '.[] | {id, status, createdAt, updatedAt, commit: .commit?.id, failureMessage} | @yaml'
