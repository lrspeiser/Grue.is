#!/usr/bin/env bash
# Follow live logs via Server-Sent Events (if enabled for your account).
# Requires: RENDER_API_TOKEN, OWNER_ID, SERVICE_ID
set -euo pipefail

: "${RENDER_API_TOKEN:?Set RENDER_API_TOKEN}"
: "${OWNER_ID:?Set OWNER_ID}"
: "${SERVICE_ID:?Set SERVICE_ID}"

TYPES=${TYPES:-app}  # comma-separated: app,request,build

exec curl -sS \
  -H "Authorization: Bearer $RENDER_API_TOKEN" \
  -H "Accept: text/event-stream" \
  "https://api.render.com/v1/logs/subscribe?ownerId=$OWNER_ID&resource=$SERVICE_ID&type=$TYPES"
