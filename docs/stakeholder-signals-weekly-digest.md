# Weekly Stakeholder Signals Digest

This feature supports a Monday-morning digest email for subscribed users.

## What it does

- runs the four stakeholder signal sweeps
- looks back at the prior week in `America/Denver`
- composes a weekly email with the top items for:
  - co-investors
  - contacts
  - companies
  - health systems
- sends the email to active users who have enabled the weekly digest in `/settings`

## Required runtime configuration

Secret Manager / Cloud Run secrets:

- `STAKEHOLDER_SIGNALS_CRON_SECRET`
- `GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL`
- `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON`

Optional:

- `GOOGLE_WORKSPACE_FROM_NAME`

Notes:

- `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` must be a Google Workspace service account that has Gmail API access configured for domain-wide delegation.
- `GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL` should be the mailbox that will send the digest email.
- If `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` is not set, the mailer falls back to `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON`, but that service account still needs Gmail send access and domain-wide delegation.

## Local/admin dry run

As an admin user, call:

```bash
curl -X POST http://localhost:3000/api/stakeholder-signals/weekly-digest \
  -H 'Content-Type: application/json' \
  -b '<auth-cookie>' \
  -d '{"dryRun":true}'
```

Dry run returns:

- the computed weekly window
- the subscriber count
- the sweep summary
- the email subject/html/text preview

## Cloud Run deployment

Deploy the app as normal:

```bash
npm run deploy:gcp
```

The deploy script now supports these extra secrets/env vars:

- `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL`
- `STAKEHOLDER_SIGNALS_CRON_SECRET`
- `GOOGLE_WORKSPACE_FROM_NAME`

## Configure Monday scheduler

After deploy, configure the Cloud Scheduler job:

```bash
export GCP_PROJECT_ID=abundant-crm
export GCP_REGION=us-central1
export GCP_SERVICE_NAME=abundant-crm
export STAKEHOLDER_SIGNALS_CRON_SECRET='replace-me'

bash scripts/configure-weekly-stakeholder-digest-scheduler.sh
```

Default schedule:

- `0 7 * * 1`
- time zone `America/Denver`

That means `7:00 AM Mountain Time every Monday`.

## Subscriber control

Each user can opt in from:

- `/settings`

The checkbox label is:

- `Weekly stakeholder digest`
