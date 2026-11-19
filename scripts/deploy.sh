#!/usr/bin/env bash
set -euo pipefail

KEY_FILE="${DOKPLOY_API_KEY_FILE:-$HOME/.config/opencode/secrets/dokploy-api-key}"
APP_ID="${DOKPLOY_APP_ID:-rFY3Ndzbbr0OFd08G3wrc}"
DOKPLOY_URL="${DOKPLOY_URL:-http://100.88.23.55:3000}"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Dokploy key not found at $KEY_FILE" >&2
  exit 1
fi

curl -fsS -X POST \
  -H "x-api-key: $(tr -d '\r\n' < "$KEY_FILE")" \
  -H 'content-type: application/json' \
  -d "{\"applicationId\":\"$APP_ID\"}" \
  "$DOKPLOY_URL/api/application.deploy" >/dev/null

echo "Deployment queued for $APP_ID"
