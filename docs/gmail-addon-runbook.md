# Gmail Add-on Runbook

This runbook covers deployment and validation for the Abundant CRM Gmail add-on backend.

## 1. What is implemented

- Add-on callback endpoint: `POST /api/addons/gmail/execute`
- Google token + CRM user authorization
- Gmail message metadata lookup
- Suggested entity matching (contacts, companies, health systems, opportunities)
- Actions:
  - attach email as note
  - add contact
  - add company
  - add health system
  - add opportunity
- Idempotency for email capture via `ExternalMessageCapture`

## 2. Required app env vars

Set these in app runtime (secret-backed in production):

- `GMAIL_ADDON_ENABLED=true`
- `GMAIL_ADDON_ENDPOINT_AUDIENCE=<exact execute endpoint URL>`
- `GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL=<workspace-add-ons service account email>`
- `GMAIL_ADDON_OAUTH_CLIENT_ID=<workspace-add-ons oauth client id>`

Optional local-only bypass:

- `GMAIL_ADDON_DEV_BYPASS_EMAIL=<existing active CRM user email>`
  - Only respected when `NODE_ENV != production`.
  - Never set in production.

## 3. Deployment template

Template file:

- `google-workspace/gmail-addon/deployment.template.json`

It uses placeholder tokens for name/logo/endpoint and includes:

- Gmail contextual trigger
- Homepage trigger
- Metadata-only Gmail scope set
- `userinfo.email` scope

## 4. Deploy Gmail add-on config

From repo root:

```bash
bash scripts/deploy-gmail-addon.sh
```

Optional overrides:

```bash
GCP_PROJECT_ID=abundant-crm \
GCP_REGION=us-central1 \
GCP_SERVICE_NAME=abundant-crm \
GMAIL_ADDON_DEPLOYMENT_ID=abundant-crm-gmail \
GMAIL_ADDON_NAME="Abundant CRM" \
bash scripts/deploy-gmail-addon.sh
```

What the script does:

1. Resolves Cloud Run URL and add-on endpoint URL.
2. Renders deployment JSON from template.
3. Creates or replaces the Workspace add-on deployment.
4. Reads add-on service-account + oauth client id from `gcloud workspace-add-ons get-authorization`.
5. Grants `roles/run.invoker` on Cloud Run service to add-on service account.
6. Optionally installs deployment for the active account.

## 5. Deploy app runtime with add-on secrets

Cloud Run deploy script now supports optional add-on secret mappings:

- `GMAIL_ADDON_ENDPOINT_AUDIENCE`
- `GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL`
- `GMAIL_ADDON_OAUTH_CLIENT_ID`

To deploy app:

```bash
GMAIL_ADDON_ENABLED=true bash scripts/deploy-gcp.sh
```

If the optional add-on secrets exist in Secret Manager, they are injected automatically.

## 6. Smoke testing

## Read-only card flow checks

```bash
APP_BASE_URL=http://localhost:3000 \
node scripts/test-gmail-addon-smoke.mjs
```

## Full write-path checks

```bash
APP_BASE_URL=http://localhost:3000 \
GMAIL_ADDON_SMOKE_ALLOW_WRITES=true \
node scripts/test-gmail-addon-smoke.mjs
```

## Write-path checks with cleanup

```bash
APP_BASE_URL=http://localhost:3000 \
GMAIL_ADDON_SMOKE_ALLOW_WRITES=true \
GMAIL_ADDON_SMOKE_CLEANUP=true \
node scripts/test-gmail-addon-smoke.mjs
```

Notes:

- Smoke script uses add-on endpoint directly.
- For local testing, set `GMAIL_ADDON_DEV_BYPASS_EMAIL` in the running app process.

## 7. Database migration

Idempotency table migration:

- `prisma/migrations/20260306213000_add_external_message_capture_idempotency/migration.sql`

Apply with your normal workflow:

```bash
npm run db:sync
```

## 8. Troubleshooting

## 401 or 403 from add-on endpoint

- Verify add-on env vars are set in app runtime.
- Confirm CRM user exists and has `USER` role.
- In local, use `GMAIL_ADDON_DEV_BYPASS_EMAIL`.

## 503 add-on disabled

- Set `GMAIL_ADDON_ENABLED=true`.

## Duplicate notes still appearing

- Confirm migration is applied and `ExternalMessageCapture` table exists.
- Confirm endpoint is running latest code.

## Workspace deployment errors

- Ensure Cloud SDK has `workspace-add-ons` commands and correct project selected.
- Ensure caller account has permission to manage Workspace add-ons and Cloud Run IAM.
