# Abundant CRM

Enterprise CRM + workflow web app for a seed-stage digital health venture firm.

## Stack

- Next.js (App Router, TypeScript)
- Prisma ORM
- PostgreSQL
- OpenAI Responses API for natural-language web-research prefill

## Current MVP scope

- Workbenches for:
  - `HealthSystem`
  - `CoInvestor`
  - `Company`
- Search + verify + queue research flow for all three entity types.
- Async research jobs with statuses (`DRAFT`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`).
- Relationship tracking:
  - company <-> health systems
  - company <-> co-investors
- Duplicate prevention based on normalized name + website + location matching.

## Quick start (recommended)

1. Start Postgres (Docker option):

```bash
npm run db:up
```

2. Setup app locally:

```bash
npm run setup:local
```

3. Start dev server:

```bash
npm run dev:local
```

Open [http://localhost:3000](http://localhost:3000).

## Manual setup (without helper scripts)

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env
```

3. Ensure `DATABASE_URL` points at your Postgres instance.

4. Sync database schema

```bash
npm run db:sync
```

5. Start app:

```bash
npm run dev
```

Open http://localhost:3000.

For day-to-day collaboration commands (pull, push, conflict handling, and database updates), see `docs/team-git-db-workflow.md`.

## Notes

- If `OPENAI_API_KEY` is missing, search still works with a fallback candidate and jobs can still be queued.
- To run real web research, set `OPENAI_API_KEY`.
- Authentication and Google Workspace integrations are intentionally deferred.
- Local database can be started/stopped with:
  - `npm run db:up`
  - `npm run db:down`

## Core files

- `prisma/schema.prisma` - Postgres schema
- `app/api/health-systems/*` - health system routes
- `app/api/co-investors/*` - co-investor routes
- `app/api/companies/*` - company routes
- `lib/research.ts` - health-system search + enrichment
- `lib/co-investor-research.ts` - co-investor search + enrichment
- `lib/company-research.ts` - company search + enrichment
- `lib/research-jobs.ts` - health-system research queue runner
- `lib/co-investor-jobs.ts` - co-investor research queue runner
- `lib/company-jobs.ts` - company research queue runner
