#!/usr/bin/env bash
set -euo pipefail

set -a
[ -f .env.local ] && source .env.local
[ -f .env ] && source .env
set +a

APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3000}"

node scripts/drain-health-system-research-jobs.mjs --base-url "$APP_BASE_URL" "$@"
