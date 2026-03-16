#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-abundant-crm}"
JOB_NAME="${GCP_STAKEHOLDER_DIGEST_JOB_NAME:-${SERVICE_NAME}-weekly-stakeholder-digest}"
SCHEDULE="${GCP_STAKEHOLDER_DIGEST_SCHEDULE:-0 7 * * 1}"
TIME_ZONE="${GCP_STAKEHOLDER_DIGEST_TIME_ZONE:-America/Denver}"
TOP_ITEMS_PER_KIND="${STAKEHOLDER_DIGEST_TOP_ITEMS_PER_KIND:-3}"
MAX_ENTITIES_PER_KIND="${STAKEHOLDER_DIGEST_MAX_ENTITIES_PER_KIND:-50}"
MAX_SIGNALS_PER_ENTITY="${STAKEHOLDER_DIGEST_MAX_SIGNALS_PER_ENTITY:-3}"
LOOKBACK_DAYS="${STAKEHOLDER_DIGEST_LOOKBACK_DAYS:-8}"
CRON_SECRET="${STAKEHOLDER_SIGNALS_CRON_SECRET:-}"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "Error: set GCP_PROJECT_ID or run 'gcloud config set project <PROJECT_ID>'" >&2
  exit 1
fi

if [ -z "$CRON_SECRET" ]; then
  echo "Error: set STAKEHOLDER_SIGNALS_CRON_SECRET before configuring the scheduler job." >&2
  exit 1
fi

SERVICE_URL="$({ gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)'; } 2>/dev/null || true)"
if [ -z "$SERVICE_URL" ]; then
  echo "Error: could not resolve Cloud Run service URL for ${SERVICE_NAME} in ${PROJECT_ID}/${REGION}." >&2
  exit 1
fi

TARGET_URL="${SERVICE_URL}/api/stakeholder-signals/weekly-digest"
REQUEST_BODY=$(printf '{"runSweeps":true,"topItemsPerKind":%s,"maxEntitiesPerKind":%s,"maxSignalsPerEntity":%s,"lookbackDays":%s}' \
  "$TOP_ITEMS_PER_KIND" \
  "$MAX_ENTITIES_PER_KIND" \
  "$MAX_SIGNALS_PER_ENTITY" \
  "$LOOKBACK_DAYS")

printf '\nConfiguring weekly stakeholder digest scheduler\n'
printf 'Project:   %s\n' "$PROJECT_ID"
printf 'Region:    %s\n' "$REGION"
printf 'Service:   %s\n' "$SERVICE_NAME"
printf 'Job:       %s\n' "$JOB_NAME"
printf 'Schedule:  %s (%s)\n' "$SCHEDULE" "$TIME_ZONE"
printf 'Target:    %s\n\n' "$TARGET_URL"

gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT_ID" >/dev/null

COMMON_ARGS=(
  --project "$PROJECT_ID"
  --location "$REGION"
  --schedule "$SCHEDULE"
  --time-zone "$TIME_ZONE"
  --uri "$TARGET_URL"
  --http-method POST
  --headers "Content-Type=application/json,X-Stakeholder-Signals-Cron-Secret=${CRON_SECRET}"
  --message-body "$REQUEST_BODY"
)

if gcloud scheduler jobs describe "$JOB_NAME" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB_NAME" "${COMMON_ARGS[@]}" >/dev/null
  printf 'Updated scheduler job %s\n' "$JOB_NAME"
else
  gcloud scheduler jobs create http "$JOB_NAME" "${COMMON_ARGS[@]}" >/dev/null
  printf 'Created scheduler job %s\n' "$JOB_NAME"
fi
