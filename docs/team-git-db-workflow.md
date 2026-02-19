# Team Git + Database Workflow (Plain English)

This is the day-to-day workflow for this repo:

- Repo: `https://github.com/todd-abundant/abundant-crm-codex`
- Stack: Next.js + Prisma + Postgres

## 1) One-time setup (each developer)

### A. Configure Git identity

```bash
git config --global user.name "Your Name"
git config --global user.email "you@company.com"
```

### B. Clone the repo

```bash
git clone https://github.com/todd-abundant/abundant-crm-codex.git
cd abundant-crm-codex
```

### C. Install and configure app

```bash
npm install
cp .env.example .env
```

Set your local Postgres URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/abundant_crm?schema=public"
```

### D. Initialize database + run app

```bash
npm run db:sync
npm run dev
```

## 2) Daily start-of-day sync (everyone)

Run these before writing code:

```bash
git checkout main
git pull --rebase origin main
npm install
npm run db:sync
```

Then create your work branch:

```bash
git checkout -b feature/<your-initials>-<short-task-name>
```

Example:

```bash
git checkout -b feature/tj-co-investor-filters
```

## 3) Save and publish your changes

```bash
git add -A
git commit -m "feat: short description"
git push -u origin HEAD
```

After first push, use:

```bash
git push
```

## 4) Bring latest `main` changes into your branch

If your branch is behind:

```bash
git fetch origin
git merge origin/main
```

Then run:

```bash
npm install
npm run db:sync
```

## 5) Resolve merge conflicts (code)

When Git reports conflicts:

```bash
git status
```

Open conflicted files and remove markers:

- `<<<<<<<`
- `=======`
- `>>>>>>>`

Keep the correct code, then:

```bash
git add <file1> <file2>
git commit
```

If you want to stop the merge attempt:

```bash
git merge --abort
```

## 6) Database workflow (Prisma)

### Shared schema change (recommended)

Use this when your schema update should be used by everyone.

1. Edit `prisma/schema.prisma`.
2. Create a migration:

```bash
npm run db:migrate:dev -- --name short_change_name
```

3. Commit both schema and migration files:

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "db: describe schema change"
git push
```

When teammates pull your branch or merged `main`, they run:

```bash
npm run db:sync
```

### Local-only schema experiment (do not share)

Use this only for temporary local testing.

```bash
npm run db:push
```

Best practice:

- Keep local-only schema experiments on a separate branch.
- Do not merge or push local-only schema changes unless they are intentional.

## 7) If database state gets broken locally

Check migration state:

```bash
npx prisma migrate status
```

If needed, reset local DB (destructive, local only):

```bash
npx prisma migrate reset
```

Then re-apply current schema:

```bash
npm run db:sync
```

## 8) New team scripts in this repo

- `npm run db:sync`
  - If committed migrations exist, applies them with `prisma migrate deploy`.
  - If no migrations exist, falls back to `prisma db push`.
  - Always runs `prisma generate` afterward.
- `npm run setup:local`
  - Runs install + db sync in one command.
- `npm run check`
  - Runs lint + production build (includes type checks) before pushing.

## 9) Team best practices

- Always sync `main` before creating a new branch.
- Keep branches short-lived (1-2 days when possible).
- Commit small chunks with clear messages.
- Run `npm run check` before pushing.
- Treat schema changes as first-class code changes:
  - Create migration for shared changes.
  - Commit migration files.
- Avoid editing the same Prisma models in multiple branches for long periods.
- Never force-push `main`.
