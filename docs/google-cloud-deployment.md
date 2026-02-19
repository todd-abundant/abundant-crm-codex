# Google Cloud Deployment (Step by Step)

This guide sets up:

- Cloud Run app deployment (code changes)
- Cloud SQL for PostgreSQL (database)
- Automatic Prisma migration run on each deploy (schema changes)
- Google OAuth secrets for sign-in
- Optional Google Docs/Drive read access foundation for future features

## 1) Prerequisites (one time)

Install:

- [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- Docker (only needed to build container locally if you want local Docker testing)
- Node.js 20+

Then authenticate:

```bash
gcloud auth login
gcloud auth application-default login
```

## 2) Pick your project settings

Use your own values:

```bash
export GCP_PROJECT_ID="YOUR_PROJECT_ID"
export GCP_REGION="us-central1"
export GCP_SERVICE_NAME="abundant-crm"
export GCP_SQL_INSTANCE="abundant-crm-postgres"
export GCP_SQL_DATABASE="abundant_crm"
export GCP_SQL_USER="abundant_app"
```

Set active project:

```bash
gcloud config set project "$GCP_PROJECT_ID"
```

## 3) Create Google Cloud project + billing

1. In Google Cloud Console, create/select the project matching `GCP_PROJECT_ID`.
2. Attach a billing account to that project.

Without billing enabled, Cloud Run/Cloud SQL deployment will fail.

## 4) Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  docs.googleapis.com \
  drive.googleapis.com \
  --project "$GCP_PROJECT_ID"
```

## 5) Create Cloud SQL Postgres

Create instance:

```bash
gcloud sql instances create "$GCP_SQL_INSTANCE" \
  --database-version=POSTGRES_15 \
  --cpu=1 \
  --memory=3840MB \
  --region="$GCP_REGION" \
  --project="$GCP_PROJECT_ID"
```

Create database:

```bash
gcloud sql databases create "$GCP_SQL_DATABASE" \
  --instance="$GCP_SQL_INSTANCE" \
  --project="$GCP_PROJECT_ID"
```

Set DB password and create user:

```bash
read -s DB_PASSWORD
gcloud sql users create "$GCP_SQL_USER" \
  --instance="$GCP_SQL_INSTANCE" \
  --password="$DB_PASSWORD" \
  --project="$GCP_PROJECT_ID"
```

Get Cloud SQL connection name:

```bash
export GCP_SQL_CONNECTION_NAME="$(gcloud sql instances describe "$GCP_SQL_INSTANCE" --project "$GCP_PROJECT_ID" --format='value(connectionName)')"
```

Build `DATABASE_URL` for Cloud Run + Cloud SQL socket:

```bash
export DATABASE_URL="postgresql://${GCP_SQL_USER}:${DB_PASSWORD}@localhost/${GCP_SQL_DATABASE}?host=/cloudsql/${GCP_SQL_CONNECTION_NAME}&schema=public"
```

If your DB password contains reserved URL characters (`@`, `:`, `/`, `?`, `#`), URL-encode it first.

## 6) Configure OAuth (Google sign-in)

1. Open **Google Cloud Console -> APIs & Services -> OAuth consent screen**.
2. Configure app details.
3. Add your users under **Test users** (if app is still testing).
4. Create OAuth client: **Credentials -> Create Credentials -> OAuth client ID -> Web application**.
5. Add initial redirect URIs:
   - `http://localhost:3000/api/auth/google/callback`
   - You will add Cloud Run callback URI after first deploy.
6. Copy client ID + secret.

Create auth secrets locally:

```bash
export AUTH_SECRET="$(openssl rand -base64 32)"
export GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
export GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
```

## 7) Create Secret Manager secrets

The deployment script expects these secret names:

- `DATABASE_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional:

- `OPENAI_API_KEY`
- `SERPAPI_API_KEY`
- `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON`

Create required secrets:

```bash
printf '%s' "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=- --project "$GCP_PROJECT_ID"
printf '%s' "$AUTH_SECRET" | gcloud secrets create AUTH_SECRET --data-file=- --project "$GCP_PROJECT_ID"
printf '%s' "$GOOGLE_CLIENT_ID" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=- --project "$GCP_PROJECT_ID"
printf '%s' "$GOOGLE_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=- --project "$GCP_PROJECT_ID"
```

If a secret already exists, update it instead:

```bash
printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL --data-file=- --project "$GCP_PROJECT_ID"
```

## 8) First deploy

From repo root:

```bash
GCP_PROJECT_ID="$GCP_PROJECT_ID" \
GCP_REGION="$GCP_REGION" \
GCP_SERVICE_NAME="$GCP_SERVICE_NAME" \
GCP_SQL_INSTANCE="$GCP_SQL_INSTANCE" \
npm run deploy:gcp
```

What the script does:

1. Enables core APIs (safe to run repeatedly).
2. Creates/uses runtime service account.
3. Grants service account Cloud SQL + Secret Manager access.
4. Builds container image with Cloud Build.
5. Runs Prisma migrations via Cloud Run Job.
6. Deploys Cloud Run service using that image.

## 9) Add Cloud Run OAuth callback URI

After first deploy, script output includes service URL, for example:

`https://abundant-crm-xxxxx-uc.a.run.app`

Add this redirect URI in your OAuth client:

`https://abundant-crm-xxxxx-uc.a.run.app/api/auth/google/callback`

Then redeploy once:

```bash
npm run deploy:gcp
```

## 10) Future upgrades (code + DB)

For each release:

```bash
git pull
npm install
npm run deploy:gcp
```

That single deploy command handles:

- New code rollout
- Prisma migration execution
- New Cloud Run revision

## 11) Rollback (if needed)

List revisions:

```bash
gcloud run revisions list \
  --service="$GCP_SERVICE_NAME" \
  --region="$GCP_REGION" \
  --project="$GCP_PROJECT_ID"
```

Send traffic back to a prior good revision:

```bash
gcloud run services update-traffic "$GCP_SERVICE_NAME" \
  --region="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" \
  --to-revisions=REVISION_NAME=100
```

## 12) Google Docs + Drive read access (foundation)

Your app does not consume Docs yet, but you can prepare now.

Create service account:

```bash
gcloud iam service-accounts create abundant-crm-docs-reader \
  --display-name="Abundant CRM Docs Reader" \
  --project="$GCP_PROJECT_ID"
```

Create a JSON key file:

```bash
gcloud iam service-accounts keys create /tmp/abundant-crm-docs-reader.json \
  --iam-account="abundant-crm-docs-reader@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$GCP_PROJECT_ID"
```

Store the JSON into Secret Manager:

```bash
cat /tmp/abundant-crm-docs-reader.json | gcloud secrets create GOOGLE_DOCS_SERVICE_ACCOUNT_JSON --data-file=- --project "$GCP_PROJECT_ID"
```

If the secret already exists:

```bash
cat /tmp/abundant-crm-docs-reader.json | gcloud secrets versions add GOOGLE_DOCS_SERVICE_ACCOUNT_JSON --data-file=- --project "$GCP_PROJECT_ID"
```

Share a Google Doc with the service account email as `Viewer`:

`abundant-crm-docs-reader@${GCP_PROJECT_ID}.iam.gserviceaccount.com`

Then redeploy:

```bash
npm run deploy:gcp
```

The deploy script will auto-inject `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` if that secret exists, so your future Docs/Drive features can use it without changing deployment flow.
