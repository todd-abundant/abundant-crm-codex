# Screening Matrix Scenario

This scenario seeds one local-only company that exercises the screening matrix rollout:

- one grey alliance member with no survey answers
- one red alliance member below the opportunity threshold
- three yellow alliance members that should create screening opportunities
- one green alliance member that should create a stronger screening opportunity
- one multi-submission institution that rolls up into a single opportunity
- seeded `Member Feedback/Status` data plus legacy screening cell fallback data

## Prerequisites

1. Apply the current schema locally.

```bash
npm run db:sync
```

2. Run the app locally.

```bash
npm run dev
```

If you use a different port, set `APP_BASE_URL` when running the seed script.

## Seed

```bash
node scripts/seed-screening-matrix-scenario.mjs
```

Example with a custom local port:

```bash
APP_BASE_URL=http://127.0.0.1:3005 node scripts/seed-screening-matrix-scenario.mjs
```

The script prints:

- the seeded company id and survey session id
- the survey access token
- the selected alliance members
- the expected preliminary-interest baseline

## What To Validate In The UI

Open the seeded company and go to the screening status matrix.

Confirm the matrix shows:

- `Participants` instead of `Attendees`
- `Preliminary Interest` driven by survey rollups
- `Current Interest` driven by the linked screening opportunity stage
- `Member Feedback/Status` inline editing

Recommended manual checks:

1. Verify the seeded baseline:
   - grey = 1
   - red = 1
   - yellow = 3
   - green = 1
2. Open one of the yellow opportunities and move it to `NEGOTIATION`.
3. Set one qualified opportunity to `ON_HOLD` from the matrix to verify `Revisit Later`.
4. Move one opportunity to `CLOSED_LOST`.
5. Return to the matrix and confirm `Current Interest` updates immediately.
6. Edit `Member Feedback/Status` in place and confirm it persists.

## Assert

Run the assertion script before or after manual edits.

```bash
node scripts/assert-screening-matrix-scenario.mjs
```

The assertion script verifies:

- the scenario company and live survey exist
- qualified survey rollups created screening opportunities
- unqualified rollups did not create screening opportunities
- multi-day survey submissions still map to a single opportunity
- survey respondent contacts were attached to the opportunity
- seeded member feedback/status data exists

It also prints a per-health-system summary including average flagged score and current opportunity stage so you can inspect the effect of your manual edits.

## Cleanup / Rollback

```bash
node scripts/cleanup-screening-matrix-scenario.mjs
```

This deletes:

- the seeded scenario company
- its screening surveys, submissions, answers, events, opportunities, and matrix history through cascade
- synthetic contacts in the `@screening-matrix-test.local` domain
- scenario-only survey questions

If you want a full local reset instead of targeted cleanup, use the existing local reset flow:

```bash
npm run db:sync
```
