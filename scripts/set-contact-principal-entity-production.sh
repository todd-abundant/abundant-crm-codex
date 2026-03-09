#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-abundant-crm}"
INSTANCE_CONNECTION_NAME="${GCP_SQL_INSTANCE_CONNECTION_NAME:-abundant-crm:us-central1:abundant-crm-postgres}"
DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME:-DATABASE_URL}"
PROXY_PORT="${CLOUD_SQL_PROXY_PORT:-6543}"
PROXY_LOG="${CLOUD_SQL_PROXY_LOG:-/tmp/cloudsql-proxy-principal-entity.log}"

if command -v cloud_sql_proxy >/dev/null 2>&1; then
  PROXY_BIN="$(command -v cloud_sql_proxy)"
elif command -v cloud-sql-proxy >/dev/null 2>&1; then
  PROXY_BIN="$(command -v cloud-sql-proxy)"
elif [ -x "/Users/avpuser/Documents/google-cloud-sdk/bin/cloud_sql_proxy" ]; then
  PROXY_BIN="/Users/avpuser/Documents/google-cloud-sdk/bin/cloud_sql_proxy"
else
  echo "cloud_sql_proxy not found in PATH."
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud not found in PATH."
  exit 1
fi

"$PROXY_BIN" -instances="${INSTANCE_CONNECTION_NAME}=tcp:${PROXY_PORT}" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!

cleanup() {
  kill "$PROXY_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 4

PROD_URL="$(
  gcloud secrets versions access latest \
    --secret="$DATABASE_URL_SECRET_NAME" \
    --project "$PROJECT_ID"
)"

if [ -z "$PROD_URL" ]; then
  echo "Resolved empty production DATABASE_URL from Secret Manager."
  exit 1
fi

DATABASE_URL="$(
  node -e 'const u=new URL(process.argv[1]); u.hostname="127.0.0.1"; u.port=process.argv[2]; u.searchParams.delete("host"); process.stdout.write(u.toString());' \
    "$PROD_URL" \
    "$PROXY_PORT"
)"

export DATABASE_URL
npm run db:contacts:set-principal-entity -- "$@"
