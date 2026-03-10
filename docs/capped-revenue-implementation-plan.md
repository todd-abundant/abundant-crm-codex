# Capped Revenue Implementation Plan

## Goal

Support two realities at the same time:

1. Operationally, Abundant still wants to sign every screening LOI and commercial acceleration deal.
2. Financially, management reporting should not overstate revenue once a contract cap has already been reached.

The system also needs to roll up cash compensation and equity compensation separately.

## Current State

Today the pipeline model is flat:

- `CompanyOpportunity.contractPriceUsd` is the only revenue field in [prisma/schema.prisma](/Users/avpuser/Documents/Abundant CRM (Codex)/prisma/schema.prisma).
- Opportunity create/update APIs read and write that single amount in [app/api/pipeline/opportunities/[id]/opportunities/route.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/app/api/pipeline/opportunities/[id]/opportunities/route.ts).
- Pipeline detail returns the same single field in [app/api/pipeline/opportunities/[id]/route.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/app/api/pipeline/opportunities/[id]/route.ts).
- Company reports sum open opportunity amounts directly in [lib/company-reports.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/lib/company-reports.ts).
- The management report page edits and displays the same single amount in [app/reports/page.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/app/reports/page.tsx), [components/pipeline-opportunity-detail.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/components/pipeline-opportunity-detail.tsx), and [components/company-workbench.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/components/company-workbench.tsx).

Two gaps follow from that:

- Caps are not modeled anywhere, so a fourth signed LOI still inflates pipeline value even when a screening contract is already capped.
- Cash and equity are not separated, so management reporting cannot answer "how much of the pipeline is cash vs equity?"

There is also a modeling split for screening:

- LOI execution status lives in `CompanyLoi`.
- Revenue forecasting lives in `CompanyOpportunity`.

That split is workable, but only if the two stay synchronized.

## Recommended Model

### 1. Add a fee schedule entity

Create a new model such as `CompanyFeeSchedule` to represent the contract terms shared across multiple opportunities.

This entity is company-specific by design. It should be created from the venture studio contract terms that are agreed before screening begins, not from a global default pricing table.

Recommended fields:

- `id`
- `companyId`
- `programType` enum: `SCREENING_LOI`, `COMMERCIAL_ACCELERATION`
- `name`
- `sourceDocumentId` pointing to the executed `VENTURE_STUDIO_CONTRACT` document when available
- `initializationSource` enum such as `MANUAL`, `CONTRACT_EXTRACTED`, `CONTRACT_EXTRACTED_AND_EDITED`
- `reviewStatus` enum such as `DRAFT`, `REVIEWED`, `ACTIVE`, `SUPERSEDED`
- `effectiveStartAt`
- `effectiveEndAt`
- `supersededByFeeScheduleId`
- `capUsd`
- `defaultCashFeeUsd`
- `defaultEquityValueUsd`
- `isActive`
- `notes`
- `createdAt`
- `updatedAt`

Why this is needed:

- The cap belongs to the contract arrangement, not to any one opportunity.
- Per-opportunity fee defaults (`$50k` screening, `$150k` commercial) belong with the same arrangement.
- The arrangement can vary by company based on the executed venture studio contract.
- If terms are amended later, a new schedule can supersede the old one without rewriting historical opportunity economics.
- It avoids repeating cap terms on every opportunity row.

### 1A. Initialize fee schedules from uploaded venture studio contracts

Recommended workflow:

1. User uploads a `VENTURE_STUDIO_CONTRACT` document.
2. The system reads the document and extracts candidate terms:
   - screening cap
   - screening per-LOI fee
   - commercial acceleration cap
   - commercial per-opportunity fee
   - cash vs equity compensation structure
   - effective date, if stated
3. The system creates draft `CompanyFeeSchedule` rows linked to that source document.
4. A user reviews the extracted values, edits anything needed, and activates the schedules.

Important implementation rule:

- Extraction should initialize fields, not silently finalize them.
- The extracted schedule should stay editable, because contract language may be ambiguous or non-standard.
- If extraction fails, a user should still be able to create the schedule manually from the same contract.

### 2. Split opportunity value into cash and equity components

Add these nullable fields to `CompanyOpportunity`:

- `feeScheduleId`
- `grossCashFeeUsd`
- `grossEquityValueUsd`

Keep `contractPriceUsd` during the migration, then retire it after all readers move to the new fields.

Recommended rule:

- Gross opportunity value = `grossCashFeeUsd + grossEquityValueUsd`
- Cash-only deals use `grossCashFeeUsd`
- Equity-only deals use `grossEquityValueUsd`
- Mixed deals are supported without another schema change

Important behavior:

- Opportunities should store the `feeScheduleId` that applied when they were created or repriced.
- That means a later contract amendment does not silently restate historical opportunity values unless a user explicitly reassigns them.

### 3. Make screening LOIs sync with opportunity rows

`CompanyLoi` should remain the operational source of truth for health-system LOI status, but every meaningful screening LOI should have a linked `CompanyOpportunity` row for reporting.

Recommended implementation:

- On `CompanyLoi` upsert in [app/api/pipeline/opportunities/[id]/screening/route.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/app/api/pipeline/opportunities/[id]/screening/route.ts), create or update the matching `SCREENING_LOI` opportunity for the same `companyId + healthSystemId`.
- Map LOI status to opportunity stage consistently.
- Pull default fee amounts from the active screening fee schedule for that company.

This removes the current risk of one part of the product saying "signed" while reporting still shows no revenue opportunity.

## Rollup Rules

Implement the cap logic in one shared server-side calculator, for example `lib/opportunity-revenue.ts`.

### Gross vs bookable vs excess

For every opportunity under a fee schedule, compute:

- `grossCashFeeUsd`
- `grossEquityValueUsd`
- `grossTotalUsd`
- `bookableCashFeeUsd`
- `bookableEquityValueUsd`
- `bookableTotalUsd`
- `excessTotalUsd`
- `weightedBookableCashFeeUsd`
- `weightedBookableEquityValueUsd`
- `weightedBookableTotalUsd`
- `capStatus` = `WITHIN_CAP`, `PARTIALLY_CAPPED`, or `CAPPED_OUT`

### Allocation order

For each fee schedule:

1. Closed-won opportunities consume cap first.
2. Remaining open opportunities consume the remaining cap in priority order.
3. Any opportunity above the remaining cap still stays visible operationally, but contributes `0` additional bookable revenue.

Recommended open-opportunity sort order:

1. Higher `likelihoodPercent`
2. Earlier `estimatedCloseDate`
3. Earlier `createdAt`

That gives a stable and defensible way to decide which open opportunities still fit under the cap.
All open opportunities remain visible in pipeline management even when they no longer contribute incremental bookable revenue.

### Weighting rule

Weighted pipeline should use the bookable amount, not the gross amount:

- `weightedBookable = bookableAmount * likelihoodPercent / 100`

This prevents open deals above the cap from contributing phantom weighted revenue.

## API and UI Changes

### Backend

Update these read/write surfaces:

- [app/api/pipeline/opportunities/[id]/opportunities/route.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/app/api/pipeline/opportunities/[id]/opportunities/route.ts)
  - accept `feeScheduleId`, `grossCashFeeUsd`, `grossEquityValueUsd`
  - default from the schedule when values are omitted
- [app/api/pipeline/opportunities/[id]/route.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/app/api/pipeline/opportunities/[id]/route.ts)
  - return gross and computed bookable values per opportunity
- [app/api/reports/opportunities/route.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/app/api/reports/opportunities/route.ts)
  - return capped/bookable rollups and cash/equity summary totals
- [lib/company-reports.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/lib/company-reports.ts)
  - use the shared calculator instead of summing `contractPriceUsd`

### Frontend

Update the main edit and reporting surfaces:

- [components/pipeline-opportunity-detail.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/components/pipeline-opportunity-detail.tsx)
  - show fee schedule
  - show cash and equity amounts
  - show when an opportunity is capped out
- [app/reports/page.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/app/reports/page.tsx)
  - replace "Contract Price" with gross/bookable fields
  - add summary chips for bookable cash, bookable equity, weighted cash, weighted equity, and capped-out count
- [components/company-workbench.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/components/company-workbench.tsx)
  - show bookable value instead of only raw amount in company-level opportunity tables

Recommended display pattern:

- Keep a "Gross" column for operational context.
- Add a "Bookable" column for management reporting.
- Add a "Comp" indicator: `Cash`, `Equity`, `Mixed`.
- Add a visual cap badge when value is partially or fully capped out.

## Agreed Defaults

The following implementation choices are now assumed:

1. Open deals do compete for limited remaining cap, but all deals remain operationally important and should stay visible in the pipeline.
2. Equity is treated as a cash-equivalent USD amount for cap allocation and weighted pipeline math.
3. Cash and equity still roll up separately for management reporting, even though both count against the same cap.
4. Screening reporting should be driven by synced `SCREENING_LOI` opportunities, while `CompanyLoi` remains the operational source of truth for LOI status.
5. Terms are set on a company-by-company basis from the venture studio contract executed before screening, with support for amended schedules later if needed.

That means:

- `CompanyLoi` controls the status workflow for each health system.
- A matching `CompanyOpportunity` is created or updated automatically for reporting, next steps, and forecasting.
- Reports read the opportunity layer, not `CompanyLoi` directly.
- Fee schedules are attached to the company and can differ across companies, even for the same program type.
- Uploading a venture studio contract should initialize draft company-specific fee terms that can be reviewed and overridden later.

## Migration and Backfill

This part needs care because current data does not encode cap terms or payment form.

### Schema migration

1. Add new fee schedule table and new opportunity amount fields.
2. Backfill `grossCashFeeUsd = contractPriceUsd` for all existing opportunities.
3. Leave `grossEquityValueUsd = null` initially.
4. Leave `contractPriceUsd` in place temporarily for compatibility.

### Contract-term backfill

Do not try to infer caps automatically from current data. The system cannot reliably determine:

- whether a screening company was capped at `$150k` or `$200k`
- whether compensation should be cash or equity
- whether a commercial contract belongs to one cap bucket or another

Instead:

1. Create an admin workflow to assign or generate a fee schedule per company/program from the executed venture studio contract.
2. Seed suggested defaults by opportunity type where obvious.
3. Require human review before enabling capped reporting for historical records.

Until a fee schedule is assigned, reporting should mark those opportunities as `uncapped / terms missing` rather than pretending the cap is known.

## Delivery Sequence

### Phase 1: Data model and calculation engine

- Prisma schema changes in [prisma/schema.prisma](/Users/avpuser/Documents/Abundant CRM (Codex)/prisma/schema.prisma)
- migration and backfill SQL
- shared calculation helper in a new `lib/opportunity-revenue.ts`
- unit tests for cap allocation edge cases
- manual fee schedule CRUD linked to the venture studio contract document

### Phase 2: Opportunity CRUD and screening sync

- update opportunity create/edit APIs
- update screening LOI upsert flow to maintain reporting opportunities
- expose computed fields on detail and report APIs
- add contract-term extraction on `VENTURE_STUDIO_CONTRACT` upload to prefill draft fee schedules

### Phase 3: Reporting surfaces

- update [app/reports/page.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/app/reports/page.tsx)
- update [components/pipeline-opportunity-detail.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/components/pipeline-opportunity-detail.tsx)
- update [components/company-workbench.tsx](/Users/avpuser/Documents/Abundant CRM (Codex)/components/company-workbench.tsx)
- update [lib/company-reports.ts](/Users/avpuser/Documents/Abundant CRM (Codex)/lib/company-reports.ts)

### Phase 4: Data cleanup and rollout

- assign fee schedules to historical companies
- verify management totals against a manual spreadsheet sample
- remove or stop reading legacy `contractPriceUsd`

## Tests to Add

- Cap fully consumed by closed-won opportunities
- Cap partially consumed by a later opportunity
- Open pipeline weighting after the cap is already exhausted
- Cash-only rollups
- Equity-only rollups
- Mixed cash/equity rollups
- Screening LOI status sync creating/updating the matching opportunity
- Missing fee schedule behavior
- Contract upload initializes draft fee schedules from extracted terms
- Extracted fee schedule can be reviewed and overridden before activation

## Open Decisions

Only one meaningful product decision remains before implementation starts:

1. Do we need a manual "cap priority" override later, or is the default ordering by likelihood, expected close date, and created date sufficient for now?

## Recommendation

Implement this with a new fee-schedule entity plus computed rollups, not by trying to patch cap fields directly onto each opportunity.

That gives three things the current model cannot do cleanly:

- shared contract caps across many opportunities
- cash and equity tracked separately
- a defensible management-reporting view that still preserves the operational reality of signing every deal
