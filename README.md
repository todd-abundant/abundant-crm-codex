# Abundant CRM

Enterprise CRM + workflow web app for a seed-stage digital health venture firm.

## Stack

- Next.js (App Router, TypeScript)
- Prisma ORM
- PostgreSQL
- OpenAI Responses API for natural-language web-research prefill

## Features in this first slice

- Modern branded UI workbench for adding `HealthSystem` records
- Search and verify flow for new records:
  - user types a health system name
  - API searches the web for likely matches
  - user verifies the correct one by location
  - app queues an async research agent job
  - agent fills structured CRM fields later
- Structured data model for:
  - core account details (HQ, website, net patient revenue)
  - LP status + LP investment amount
  - alliance membership
  - innovation and venture team presence
  - executive team
  - venture partners and investments
  - research status and job queue tracking

## Local setup

1. Install dependencies

```bash
npm install
```

2. Configure env

```bash
cp .env.example .env
```

3. Ensure `DATABASE_URL` points at your local Postgres instance.

4. Push schema to Postgres

```bash
npm run db:push
```

5. Start app

```bash
npm run dev
```

Open http://localhost:3000.

## Notes

- If `OPENAI_API_KEY` is missing, search still works with a fallback candidate and jobs can still be queued.
- To run real web research, set `OPENAI_API_KEY`.
- Authentication and Google Workspace integrations are intentionally deferred.

## Core files

- `prisma/schema.prisma` - Postgres schema
- `app/api/health-systems/route.ts` - list + create health systems
- `app/api/health-systems/search/route.ts` - health system candidate search
- `app/api/health-systems/verify/route.ts` - verify + queue a research job
- `app/api/health-systems/research-jobs/process/route.ts` - run queued jobs
- `lib/research.ts` - web search + structured enrichment logic
- `lib/research-jobs.ts` - queueing and async research execution
- `components/health-system-workbench.tsx` - primary UI
