# Codex Quickstart (For Humans)

Use this if you just want to get the app running with minimal setup friction.

## What you need first

- Git installed
- Node.js 20+ (includes npm)
- Docker Desktop running
- Codex app/CLI access

## 1) Get the code

If you do not already have the repo:

```bash
git clone https://github.com/todd-abundant/abundant-crm-codex.git
cd abundant-crm-codex
```

If you already have it, just open that folder in Codex.

## 2) Start the database

```bash
npm run db:up
```

This starts Postgres in Docker.

## 3) Run one-time local setup

```bash
npm run setup:local
```

This will:
- install packages
- create `.env` from `.env.example` (if missing)
- sync the Prisma schema to your local database

## 4) Start the app

```bash
npm run dev:local
```

Open [http://localhost:3000](http://localhost:3000).

## 5) Sign in

Go to [http://localhost:3000/sign-in](http://localhost:3000/sign-in).

If Google sign-in is not configured yet, follow:
- [`docs/google-oauth-local-setup.md`](./google-oauth-local-setup.md)

## Daily restart commands

Use these on a normal day:

```bash
git checkout main
git pull --rebase origin main
npm install
npm run db:sync
npm run dev:local
```

## Useful commands

- Stop database: `npm run db:down`
- Re-sync database schema: `npm run db:sync`
- Lint + production build check: `npm run check`

## If something breaks

1. Copy the exact terminal error.
2. Ask Codex: "Fix this setup error for this repo" and paste the error.
3. If it is auth-related, double-check `.env` values from the Google OAuth setup doc.
