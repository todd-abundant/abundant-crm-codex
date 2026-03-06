#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
Deploy or update the Abundant CRM Gmail add-on (HTTP runtime) in Google Workspace.

Usage:
  bash scripts/deploy-gmail-addon.sh

Optional environment variables:
  GCP_PROJECT_ID                Google Cloud project ID (defaults to current gcloud config).
  GCP_REGION                    Cloud Run region (default: us-central1).
  GCP_SERVICE_NAME              Cloud Run service name (default: abundant-crm).
  GMAIL_ADDON_DEPLOYMENT_ID     Workspace add-on deployment id (default: abundant-crm-gmail).
  GMAIL_ADDON_NAME              Add-on display name (default: Abundant CRM).
  GMAIL_ADDON_ENDPOINT_URL      Full endpoint URL override (default: <Cloud Run URL>/api/addons/gmail/execute).
  GMAIL_ADDON_LOGO_URL          Logo URL override (default: <Cloud Run URL>/icon.svg).
  GMAIL_ADDON_INSTALL           Install deployment after create/replace (default: true).
  GMAIL_ADDON_TEMPLATE_FILE     Deployment template path.
HELP
  exit 0
fi

log() {
  printf "\n[%s] %s\n" "$(date +%H:%M:%S)" "$*"
}

die() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "Required command '$cmd' is not installed."
  fi
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

require_command gcloud

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  die "Set GCP_PROJECT_ID or run: gcloud config set project <PROJECT_ID>"
fi

REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-abundant-crm}"
DEPLOYMENT_ID="${GMAIL_ADDON_DEPLOYMENT_ID:-abundant-crm-gmail}"
ADDON_NAME="${GMAIL_ADDON_NAME:-Abundant CRM}"
INSTALL_DEPLOYMENT="${GMAIL_ADDON_INSTALL:-true}"

SERVICE_URL="$(
  gcloud run services describe "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)' 2>/dev/null || true
)"

if [[ -z "$SERVICE_URL" && -z "${GMAIL_ADDON_ENDPOINT_URL:-}" ]]; then
  die "Could not resolve Cloud Run URL. Set GMAIL_ADDON_ENDPOINT_URL explicitly or deploy Cloud Run first."
fi

ENDPOINT_URL="${GMAIL_ADDON_ENDPOINT_URL:-${SERVICE_URL%/}/api/addons/gmail/execute}"
LOGO_URL="${GMAIL_ADDON_LOGO_URL:-${SERVICE_URL%/}/icon.svg}"

TEMPLATE_FILE="${GMAIL_ADDON_TEMPLATE_FILE:-google-workspace/gmail-addon/deployment.template.json}"
if [[ ! -f "$TEMPLATE_FILE" ]]; then
  die "Template file not found: $TEMPLATE_FILE"
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

sed \
  -e "s|__ADDON_NAME__|$(escape_sed "$ADDON_NAME")|g" \
  -e "s|__ENDPOINT_URL__|$(escape_sed "$ENDPOINT_URL")|g" \
  -e "s|__LOGO_URL__|$(escape_sed "$LOGO_URL")|g" \
  "$TEMPLATE_FILE" > "$TMP_FILE"

if gcloud workspace-add-ons deployments describe "$DEPLOYMENT_ID" --project "$PROJECT_ID" >/dev/null 2>&1; then
  log "Updating Workspace add-on deployment: $DEPLOYMENT_ID"
  gcloud workspace-add-ons deployments replace "$DEPLOYMENT_ID" \
    --project "$PROJECT_ID" \
    --deployment-file "$TMP_FILE" >/dev/null
else
  log "Creating Workspace add-on deployment: $DEPLOYMENT_ID"
  gcloud workspace-add-ons deployments create "$DEPLOYMENT_ID" \
    --project "$PROJECT_ID" \
    --deployment-file "$TMP_FILE" >/dev/null
fi

ADDON_SERVICE_ACCOUNT="$(gcloud workspace-add-ons get-authorization --project "$PROJECT_ID" --format='value(serviceAccountEmail)' 2>/dev/null || true)"
ADDON_OAUTH_CLIENT_ID="$(gcloud workspace-add-ons get-authorization --project "$PROJECT_ID" --format='value(oauthClientId)' 2>/dev/null || true)"

if [[ -n "$ADDON_SERVICE_ACCOUNT" ]]; then
  log "Granting Cloud Run invoker to add-on service account: $ADDON_SERVICE_ACCOUNT"
  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --member "serviceAccount:${ADDON_SERVICE_ACCOUNT}" \
    --role "roles/run.invoker" >/dev/null
else
  log "Could not resolve add-on service account email from get-authorization."
fi

if [[ "$INSTALL_DEPLOYMENT" == "true" ]]; then
  log "Installing deployment for current account: $DEPLOYMENT_ID"
  gcloud workspace-add-ons deployments install "$DEPLOYMENT_ID" --project "$PROJECT_ID" >/dev/null
fi

cat <<SUMMARY

Gmail add-on deployment ready.
Project:               $PROJECT_ID
Deployment ID:         $DEPLOYMENT_ID
Endpoint URL:          $ENDPOINT_URL
Logo URL:              $LOGO_URL
Add-on service acct:   ${ADDON_SERVICE_ACCOUNT:-<unresolved>}
Add-on OAuth client:   ${ADDON_OAUTH_CLIENT_ID:-<unresolved>}

Set these app environment values (secret-backed in production):
  GMAIL_ADDON_ENABLED=true
  GMAIL_ADDON_ENDPOINT_AUDIENCE=$ENDPOINT_URL
  GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL=${ADDON_SERVICE_ACCOUNT:-}
  GMAIL_ADDON_OAUTH_CLIENT_ID=${ADDON_OAUTH_CLIENT_ID:-}

Next local smoke test:
  APP_BASE_URL=${SERVICE_URL:-http://localhost:3000} GMAIL_ADDON_SMOKE_ALLOW_WRITES=true node scripts/test-gmail-addon-smoke.mjs
SUMMARY
