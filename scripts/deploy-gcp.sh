#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Deploy the app to Google Cloud Run and apply Prisma migrations.

Usage:
  bash scripts/deploy-gcp.sh

Optional environment variables:
  GCP_PROJECT_ID                       Google Cloud project ID (defaults to current gcloud config).
  GCP_REGION                           Cloud Run + Artifact Registry region (default: us-central1).
  GCP_SERVICE_NAME                     Cloud Run service name (default: abundant-crm).
  GCP_SQL_INSTANCE                     Cloud SQL instance name (default: abundant-crm-postgres).
  GCP_SQL_CONNECTION_NAME              Full Cloud SQL connection string (PROJECT:REGION:INSTANCE).
  GCP_ARTIFACT_REPO                    Artifact Registry Docker repo name (default: abundant-crm).
  GCP_MIGRATION_JOB                    Cloud Run job for migrations (default: <service>-migrate).
  GCP_RUNTIME_SERVICE_ACCOUNT_NAME     Runtime service account name if creating default SA.
  GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL    Existing runtime service account email to use.
  GCP_IMAGE_URI                        Full image URI override.
  GCP_IMAGE_TAG                        Image tag override if image URI is not provided.
  GCP_MAX_INSTANCES                    Cloud Run max instances (default: 3).
  GCP_MIN_INSTANCES                    Cloud Run min instances (default: 0).
  GCP_CPU                              Cloud Run CPU (default: 1).
  GCP_MEMORY                           Cloud Run memory (default: 1Gi).
  GCP_REQUEST_TIMEOUT                  Request timeout in seconds (default: 300).
  GCP_MIGRATION_TIMEOUT                Migration job timeout (default: 10m).
  ALLOW_UNAUTHENTICATED                true/false (default: true).
  SKIP_MIGRATIONS                      true/false to skip Prisma migration job (default: false).
  OPENAI_MODEL                         Default OPENAI_MODEL env var on service.
  OPENAI_SEARCH_MODEL                  Default OPENAI_SEARCH_MODEL env var on service.
  GMAIL_ADDON_ENABLED                  Enable Gmail add-on endpoint behavior (default: preserve current service value, else false).
  GOOGLE_OAUTH_REDIRECT_URI            Optional explicit redirect URI.
  GOOGLE_WORKSPACE_FROM_NAME           Optional display name for weekly stakeholder digest emails.
EOF
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

normalize_bool() {
  local value="$1"
  local name="$2"
  value="$(printf "%s" "$value" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    ""|true|1|yes|on)
      echo true
      ;;
    false|0|no|off)
      echo false
      ;;
    *)
      die "Environment variable '${name}' must be true/false, got '${1}'."
      ;;
  esac
}

require_command gcloud

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  die "Set GCP_PROJECT_ID or run: gcloud config set project <PROJECT_ID>"
fi

if [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  RESOLVED_PROJECT_ID="$(gcloud projects describe "$PROJECT_ID" --format='value(projectId)' 2>/dev/null || true)"
  if [ -n "$RESOLVED_PROJECT_ID" ]; then
    log "Resolved project number '${PROJECT_ID}' to project ID '${RESOLVED_PROJECT_ID}'."
    PROJECT_ID="$RESOLVED_PROJECT_ID"
  fi
fi

BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
BILLING_ACCOUNT_NAME="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"

if [ -z "$BILLING_ENABLED" ]; then
  log "Could not verify billing status via CLI (insufficient permission or billing API restriction). Continuing."
elif [ "$BILLING_ENABLED" != "True" ] && [ "$BILLING_ENABLED" != "true" ]; then
  die "Billing is not enabled for project '${PROJECT_ID}'. Link an OPEN billing account, then retry."
fi

if [ -n "$BILLING_ACCOUNT_NAME" ]; then
  BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_NAME##*/}"
  BILLING_ACCOUNT_OPEN="$(gcloud billing accounts describe "$BILLING_ACCOUNT_ID" --format='value(open)' 2>/dev/null || true)"
  if [ -n "$BILLING_ACCOUNT_OPEN" ] && [ "$BILLING_ACCOUNT_OPEN" != "True" ] && [ "$BILLING_ACCOUNT_OPEN" != "true" ]; then
    die "Billing account '${BILLING_ACCOUNT_ID}' is linked but not open. Re-open it or link a different open account."
  fi
fi

REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-abundant-crm}"
SQL_INSTANCE="${GCP_SQL_INSTANCE:-abundant-crm-postgres}"
SQL_CONNECTION_NAME="${GCP_SQL_CONNECTION_NAME:-${PROJECT_ID}:${REGION}:${SQL_INSTANCE}}"
ARTIFACT_REPO="${GCP_ARTIFACT_REPO:-abundant-crm}"
MIGRATION_JOB_NAME="${GCP_MIGRATION_JOB:-${SERVICE_NAME}-migrate}"

MAX_INSTANCES="${GCP_MAX_INSTANCES:-3}"
MIN_INSTANCES="${GCP_MIN_INSTANCES:-0}"
CPU="${GCP_CPU:-1}"
MEMORY="${GCP_MEMORY:-1Gi}"
REQUEST_TIMEOUT="${GCP_REQUEST_TIMEOUT:-300}"
MIGRATION_TIMEOUT="${GCP_MIGRATION_TIMEOUT:-10m}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
ALLOW_UNAUTHENTICATED="$(normalize_bool "$ALLOW_UNAUTHENTICATED" "ALLOW_UNAUTHENTICATED")"
SKIP_MIGRATIONS="$(normalize_bool "${SKIP_MIGRATIONS:-false}" "SKIP_MIGRATIONS")"

RUNTIME_SERVICE_ACCOUNT_NAME="${GCP_RUNTIME_SERVICE_ACCOUNT_NAME:-abundant-crm-runner}"
EXPLICIT_RUNTIME_SERVICE_ACCOUNT_EMAIL="${GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL:-}"
if [ -n "$EXPLICIT_RUNTIME_SERVICE_ACCOUNT_EMAIL" ]; then
  RUNTIME_SERVICE_ACCOUNT_EMAIL="$EXPLICIT_RUNTIME_SERVICE_ACCOUNT_EMAIL"
else
  RUNTIME_SERVICE_ACCOUNT_EMAIL="${RUNTIME_SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

IMAGE_TAG="${GCP_IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo manual)}"
IMAGE_URI="${GCP_IMAGE_URI:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:${IMAGE_TAG}}"

check_secret_exists() {
  local secret_name="$1"
  gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1
}

read_existing_service_env_value() {
  local env_name="$1"

  gcloud run services describe "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='yaml(spec.template.spec.containers[0].env)' 2>/dev/null | \
    awk -v target="$env_name" '
      $1 == "-" && $2 == "name:" {
        current = $3
        next
      }
      $1 == "value:" && current == target {
        value = $2
        gsub(/^'\''/, "", value)
        gsub(/'\''$/, "", value)
        print value
        exit
      }
    '
}

SECRET_MAPPINGS=()
add_required_secret_mapping() {
  local env_var="$1"
  local secret_name="$2"
  if ! check_secret_exists "$secret_name"; then
    die "Missing required secret '${secret_name}'. Create it in Secret Manager first."
  fi
  SECRET_MAPPINGS+=("${env_var}=${secret_name}:latest")
}

add_optional_secret_mapping() {
  local env_var="$1"
  local secret_name="$2"
  if check_secret_exists "$secret_name"; then
    SECRET_MAPPINGS+=("${env_var}=${secret_name}:latest")
  else
    log "Optional secret '${secret_name}' not found; skipping."
  fi
}

DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME:-DATABASE_URL}"
AUTH_SECRET_SECRET_NAME="${AUTH_SECRET_SECRET_NAME:-AUTH_SECRET}"
GOOGLE_CLIENT_ID_SECRET_NAME="${GOOGLE_CLIENT_ID_SECRET_NAME:-GOOGLE_CLIENT_ID}"
GOOGLE_CLIENT_SECRET_SECRET_NAME="${GOOGLE_CLIENT_SECRET_SECRET_NAME:-GOOGLE_CLIENT_SECRET}"
OPENAI_API_KEY_SECRET_NAME="${OPENAI_API_KEY_SECRET_NAME:-OPENAI_API_KEY}"
SERPAPI_API_KEY_SECRET_NAME="${SERPAPI_API_KEY_SECRET_NAME:-SERPAPI_API_KEY}"
GOOGLE_DOCS_SERVICE_ACCOUNT_JSON_SECRET_NAME="${GOOGLE_DOCS_SERVICE_ACCOUNT_JSON_SECRET_NAME:-GOOGLE_DOCS_SERVICE_ACCOUNT_JSON}"
GMAIL_ADDON_ENDPOINT_AUDIENCE_SECRET_NAME="${GMAIL_ADDON_ENDPOINT_AUDIENCE_SECRET_NAME:-GMAIL_ADDON_ENDPOINT_AUDIENCE}"
GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL_SECRET_NAME="${GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL_SECRET_NAME:-GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL}"
GMAIL_ADDON_OAUTH_CLIENT_ID_SECRET_NAME="${GMAIL_ADDON_OAUTH_CLIENT_ID_SECRET_NAME:-GMAIL_ADDON_OAUTH_CLIENT_ID}"
GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_SECRET_NAME="${GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_SECRET_NAME:-GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON}"
GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL_SECRET_NAME="${GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL_SECRET_NAME:-GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL}"
STAKEHOLDER_SIGNALS_CRON_SECRET_SECRET_NAME="${STAKEHOLDER_SIGNALS_CRON_SECRET_SECRET_NAME:-STAKEHOLDER_SIGNALS_CRON_SECRET}"

log "Ensuring required Google Cloud APIs are enabled..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  --project "$PROJECT_ID" >/dev/null

if [ -n "$EXPLICIT_RUNTIME_SERVICE_ACCOUNT_EMAIL" ]; then
  if ! gcloud iam service-accounts describe "$RUNTIME_SERVICE_ACCOUNT_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    die "Runtime service account '${RUNTIME_SERVICE_ACCOUNT_EMAIL}' was not found in project '${PROJECT_ID}'."
  fi
else
  if ! gcloud iam service-accounts describe "$RUNTIME_SERVICE_ACCOUNT_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    log "Creating runtime service account: $RUNTIME_SERVICE_ACCOUNT_EMAIL"
    gcloud iam service-accounts create "$RUNTIME_SERVICE_ACCOUNT_NAME" \
      --display-name "Abundant CRM Cloud Run runtime" \
      --project "$PROJECT_ID" >/dev/null
  fi
fi

for role in "roles/cloudsql.client" "roles/secretmanager.secretAccessor"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT_EMAIL}" \
    --role "$role" >/dev/null
done

if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  log "Creating Artifact Registry repository: $ARTIFACT_REPO"
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format docker \
    --location "$REGION" \
    --description "Docker images for ${SERVICE_NAME}" \
    --project "$PROJECT_ID" >/dev/null
fi

add_required_secret_mapping "DATABASE_URL" "$DATABASE_URL_SECRET_NAME"
add_required_secret_mapping "AUTH_SECRET" "$AUTH_SECRET_SECRET_NAME"
add_required_secret_mapping "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID_SECRET_NAME"
add_required_secret_mapping "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET_SECRET_NAME"
add_optional_secret_mapping "OPENAI_API_KEY" "$OPENAI_API_KEY_SECRET_NAME"
add_optional_secret_mapping "SERPAPI_API_KEY" "$SERPAPI_API_KEY_SECRET_NAME"
add_optional_secret_mapping "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON" "$GOOGLE_DOCS_SERVICE_ACCOUNT_JSON_SECRET_NAME"
add_optional_secret_mapping "GMAIL_ADDON_ENDPOINT_AUDIENCE" "$GMAIL_ADDON_ENDPOINT_AUDIENCE_SECRET_NAME"
add_optional_secret_mapping "GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL" "$GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL_SECRET_NAME"
add_optional_secret_mapping "GMAIL_ADDON_OAUTH_CLIENT_ID" "$GMAIL_ADDON_OAUTH_CLIENT_ID_SECRET_NAME"
add_optional_secret_mapping "GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON" "$GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_SECRET_NAME"
add_optional_secret_mapping "GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL" "$GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL_SECRET_NAME"
add_optional_secret_mapping "STAKEHOLDER_SIGNALS_CRON_SECRET" "$STAKEHOLDER_SIGNALS_CRON_SECRET_SECRET_NAME"

GMAIL_ADDON_ENABLED_VALUE="${GMAIL_ADDON_ENABLED:-}"
if [ -z "$GMAIL_ADDON_ENABLED_VALUE" ]; then
  GMAIL_ADDON_ENABLED_VALUE="$(read_existing_service_env_value "GMAIL_ADDON_ENABLED" || true)"
  if [ -n "$GMAIL_ADDON_ENABLED_VALUE" ]; then
    log "Preserving existing GMAIL_ADDON_ENABLED=${GMAIL_ADDON_ENABLED_VALUE} from Cloud Run service."
  fi
fi

if [ -z "$GMAIL_ADDON_ENABLED_VALUE" ]; then
  GMAIL_ADDON_ENABLED_VALUE="false"
fi

ENV_VARS=(
  "NODE_ENV=production"
  "OPENAI_MODEL=${OPENAI_MODEL:-gpt-4.1-mini}"
  "OPENAI_SEARCH_MODEL=${OPENAI_SEARCH_MODEL:-gpt-4o-mini}"
  "GMAIL_ADDON_ENABLED=${GMAIL_ADDON_ENABLED_VALUE}"
)

if [ -n "${GOOGLE_OAUTH_REDIRECT_URI:-}" ]; then
  ENV_VARS+=("GOOGLE_OAUTH_REDIRECT_URI=${GOOGLE_OAUTH_REDIRECT_URI}")
fi

if [ -n "${GOOGLE_WORKSPACE_FROM_NAME:-}" ]; then
  ENV_VARS+=("GOOGLE_WORKSPACE_FROM_NAME=${GOOGLE_WORKSPACE_FROM_NAME}")
fi

SECRET_MAPPINGS_CSV="$(IFS=, ; echo "${SECRET_MAPPINGS[*]}")"
ENV_VARS_CSV="$(IFS=, ; echo "${ENV_VARS[*]}")"
MIGRATION_SECRET_MAPPING="DATABASE_URL=${DATABASE_URL_SECRET_NAME}:latest"

log "Building image: ${IMAGE_URI}"
gcloud builds submit --tag "$IMAGE_URI" --project "$PROJECT_ID" .

if gcloud run jobs describe "$MIGRATION_JOB_NAME" --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  log "Updating migration job: ${MIGRATION_JOB_NAME}"
  gcloud run jobs update "$MIGRATION_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE_URI" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --set-cloudsql-instances "$SQL_CONNECTION_NAME" \
    --set-secrets "$MIGRATION_SECRET_MAPPING" \
    --set-env-vars "NODE_ENV=production" \
    --command "npm" \
    --args "run,db:migrate:deploy" \
    --task-timeout "$MIGRATION_TIMEOUT" \
    --max-retries 0 >/dev/null
else
  log "Creating migration job: ${MIGRATION_JOB_NAME}"
  gcloud run jobs create "$MIGRATION_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE_URI" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --set-cloudsql-instances "$SQL_CONNECTION_NAME" \
    --set-secrets "$MIGRATION_SECRET_MAPPING" \
    --set-env-vars "NODE_ENV=production" \
    --command "npm" \
    --args "run,db:migrate:deploy" \
    --task-timeout "$MIGRATION_TIMEOUT" \
    --max-retries 0 >/dev/null
fi

if [ "$SKIP_MIGRATIONS" = "true" ]; then
  log "Skipping migrations because SKIP_MIGRATIONS=true"
else
  log "Running Prisma migrations with Cloud Run Job..."
  gcloud run jobs execute "$MIGRATION_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --wait >/dev/null
fi

DEPLOY_CMD=(
  gcloud run deploy "$SERVICE_NAME"
  --project "$PROJECT_ID"
  --region "$REGION"
  --image "$IMAGE_URI"
  --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL"
  --set-cloudsql-instances "$SQL_CONNECTION_NAME"
  --set-secrets "$SECRET_MAPPINGS_CSV"
  --set-env-vars "$ENV_VARS_CSV"
  --port 8080
  --cpu "$CPU"
  --memory "$MEMORY"
  --min-instances "$MIN_INSTANCES"
  --max-instances "$MAX_INSTANCES"
  --timeout "$REQUEST_TIMEOUT"
)

if [ "$ALLOW_UNAUTHENTICATED" = "true" ]; then
  DEPLOY_CMD+=(--allow-unauthenticated)
else
  DEPLOY_CMD+=(--no-allow-unauthenticated)
fi

log "Deploying Cloud Run service: ${SERVICE_NAME}"
"${DEPLOY_CMD[@]}" >/dev/null

SERVICE_URL="$(
  gcloud run services describe "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)'
)"

cat <<EOF

Deployment complete.
Project:   ${PROJECT_ID}
Region:    ${REGION}
Service:   ${SERVICE_NAME}
Image:     ${IMAGE_URI}
URL:       ${SERVICE_URL}

OAuth callback URI (add to Google OAuth client):
${SERVICE_URL}/api/auth/google/callback

Next deploy command:
bash scripts/deploy-gcp.sh
EOF
