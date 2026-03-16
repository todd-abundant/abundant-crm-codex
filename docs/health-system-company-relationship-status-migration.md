# Health System <-> Company Relationship Status Migration Proposal

## Scope

This proposal is limited to the `CompanyHealthSystemLink` relationship schema.

It does **not** change:

- pipeline UI
- intake/deals view
- pipeline stage labels
- opportunity-stage semantics

It is an additive, staged migration proposal only.

## Current State

The current relationship record is defined in [prisma/schema.prisma](/Users/avpuser/Documents/Abundant%20CRM%20Workspace%20Prototype/abundant-crm-codex/prisma/schema.prisma#L591):

- `companyId`
- `healthSystemId`
- `relationshipType`
- `notes`
- `investmentAmountUsd`
- `ownershipPercent`

There is no dedicated relationship status field today.

Operational status currently lives nearby in other models:

- `CompanyOpportunity.stage` for screening LOI opportunity progress
- `CompanyOpportunity.preliminaryInterestOverride`
- `CompanyOpportunity.memberFeedbackStatus`
- `CompanyLoi.status`

That means the backfill must read those sources and project them onto the relationship record without deleting or overwriting the original source records.

## Proposed Schema Change

Add two nullable fields to `CompanyHealthSystemLink`:

1. `preliminaryInterest`
2. `currentState`

These should be independent fields with different jobs:

- `preliminaryInterest` captures early signal
- `currentState` captures where the relationship stands now

## Proposed Enums

### Preliminary interest

```prisma
enum CompanyHealthSystemPreliminaryInterest {
  EXPRESSED_INTEREST
  REQUESTED_MORE_INFO
  INTRO_CALL_SCHEDULED
  SCREENING_RECOMMENDED
}
```

Notes:

- This field is intentionally early-stage and non-terminal.
- Existing data does not reliably support a full automatic backfill for all rows, so many historical records will remain `null` until reviewed or updated by users.

### Current state

```prisma
enum CompanyHealthSystemCurrentState {
  ACTIVE_SCREENING
  LOI_SIGNED
  CO_DEV
  COMMERCIAL_AGREEMENT
  PASSED
  REVISIT
}
```

Notes:

- `REVISIT` is a first-class state, not a special case.
- `null` is used when the relationship has no state set yet.
- `ACTIVE_SCREENING`, `LOI_SIGNED`, `CO_DEV`, `PASSED`, and `REVISIT` match the team language in this thread.

## Proposed Prisma Shape

```prisma
model CompanyHealthSystemLink {
  id                  String                                  @id @default(cuid())
  companyId           String
  healthSystemId      String
  relationshipType    CompanyHealthSystemRelationship         @default(CUSTOMER)
  preliminaryInterest CompanyHealthSystemPreliminaryInterest?
  currentState        CompanyHealthSystemCurrentState?
  notes               String?
  investmentAmountUsd Decimal?                                @db.Decimal(16, 2)
  ownershipPercent    Decimal?                                @db.Decimal(7, 2)
  createdAt           DateTime                                @default(now())

  company      Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  healthSystem HealthSystem @relation(fields: [healthSystemId], references: [id], onDelete: Cascade)

  @@index([companyId, healthSystemId])
  @@index([currentState])
  @@index([preliminaryInterest])
}
```

## Migration Strategy

This should be a staged migration with three steps.

### Step 1: Additive schema only

Add the two new nullable/defaulted columns and enums.

Do not remove, rename, or repurpose:

- `relationshipType`
- `CompanyOpportunity.stage`
- `CompanyOpportunity.preliminaryInterestOverride`
- `CompanyOpportunity.memberFeedbackStatus`
- `CompanyLoi.status`

### Step 2: Backfill from existing operational sources

Backfill `currentState` first, because that mapping is stronger and less ambiguous.

Backfill `preliminaryInterest` only where there is an explicit, defensible source. Otherwise leave it `null`.

### Step 3: Confirm mapping with product/operator review

Review the migrated output before any write-path changes are made in UI or APIs.

Only after review:

- update write schemas
- update read models
- decide whether any old fields should later be deprecated

## Backfill Rules

### Current state mapping priority

Use the strongest available source in this order:

1. `CompanyLoi.status`
2. open `CompanyOpportunity` of type `SCREENING_LOI`
3. `CompanyOpportunity.stage` history if no LOI exists
4. leave `null`

### Current state mapping table

| Existing source | Existing value | New `currentState` |
| --- | --- | --- |
| `CompanyLoi.status` | `SIGNED` | `LOI_SIGNED` |
| `CompanyLoi.status` | `DECLINED` | `PASSED` |
| `CompanyLoi.status` | `NEGOTIATING` | `ACTIVE_SCREENING` |
| `CompanyLoi.status` | `PENDING` | `ACTIVE_SCREENING` |
| `CompanyLoi.status` | `NOT_STARTED` | `null` |
| `CompanyOpportunity.stage` | `CLOSED_WON` | `LOI_SIGNED` |
| `CompanyOpportunity.stage` | `CLOSED_LOST` | `PASSED` |
| `CompanyOpportunity.stage` | `ON_HOLD` | `REVISIT` |
| `CompanyOpportunity.stage` | `IDENTIFIED` | `ACTIVE_SCREENING` |
| `CompanyOpportunity.stage` | `QUALIFICATION` | `ACTIVE_SCREENING` |
| `CompanyOpportunity.stage` | `PROPOSAL` | `ACTIVE_SCREENING` |
| `CompanyOpportunity.stage` | `NEGOTIATION` | `ACTIVE_SCREENING` |
| `CompanyOpportunity.stage` | `LEGAL` | `ACTIVE_SCREENING` |

Notes:

- This proposal intentionally does **not** auto-backfill `CO_DEV` or `COMMERCIAL_AGREEMENT` from existing data because those states do not have a clean existing source in the current relationship model.
- Those should be set explicitly once the application starts writing to the new field.

### Preliminary interest mapping

Backfill only when there is explicit evidence.

Safe rules:

| Existing source | Existing value | New `preliminaryInterest` |
| --- | --- | --- |
| `CompanyOpportunity.preliminaryInterestOverride` | `BLUE` | `null` |
| `CompanyOpportunity.memberFeedbackStatus` | null/empty | `null` |
| any other source | ambiguous free text | `null` |

Reason:

- Existing data captures color/status semantics and free-text member feedback, but not a reliable structured early-signal lifecycle such as `REQUESTED_MORE_INFO` or `INTRO_CALL_SCHEDULED`.
- Auto-mapping free text into these new values would be destructive and unreliable.

That means the initial migration should preserve integrity by leaving most historical `preliminaryInterest` values as `null`.

## Example Records After Migration

### Example 1: Active screening

Before:

```json
{
  "companyHealthSystemLink": {
    "companyId": "cmp_1",
    "healthSystemId": "hs_1",
    "relationshipType": "CUSTOMER"
  },
  "screeningOpportunity": {
    "type": "SCREENING_LOI",
    "stage": "QUALIFICATION",
    "preliminaryInterestOverride": null,
    "memberFeedbackStatus": "Interested, wants additional diligence"
  },
  "loi": null
}
```

After:

```json
{
  "companyId": "cmp_1",
  "healthSystemId": "hs_1",
  "relationshipType": "CUSTOMER",
  "preliminaryInterest": null,
  "currentState": "ACTIVE_SCREENING"
}
```

### Example 2: Signed LOI

Before:

```json
{
  "companyHealthSystemLink": {
    "companyId": "cmp_2",
    "healthSystemId": "hs_2",
    "relationshipType": "CUSTOMER"
  },
  "loi": {
    "status": "SIGNED"
  }
}
```

After:

```json
{
  "companyId": "cmp_2",
  "healthSystemId": "hs_2",
  "relationshipType": "CUSTOMER",
  "preliminaryInterest": null,
  "currentState": "LOI_SIGNED"
}
```

### Example 3: Passed

Before:

```json
{
  "companyHealthSystemLink": {
    "companyId": "cmp_3",
    "healthSystemId": "hs_3",
    "relationshipType": "CUSTOMER"
  },
  "screeningOpportunity": {
    "type": "SCREENING_LOI",
    "stage": "CLOSED_LOST"
  }
}
```

After:

```json
{
  "companyId": "cmp_3",
  "healthSystemId": "hs_3",
  "relationshipType": "CUSTOMER",
  "preliminaryInterest": null,
  "currentState": "PASSED"
}
```

### Example 4: Revisit

Before:

```json
{
  "companyHealthSystemLink": {
    "companyId": "cmp_4",
    "healthSystemId": "hs_4",
    "relationshipType": "CUSTOMER"
  },
  "screeningOpportunity": {
    "type": "SCREENING_LOI",
    "stage": "ON_HOLD"
  }
}
```

After:

```json
{
  "companyId": "cmp_4",
  "healthSystemId": "hs_4",
  "relationshipType": "CUSTOMER",
  "preliminaryInterest": null,
  "currentState": "REVISIT"
}
```

## Why This Is Safe

This proposal is safe because:

1. it adds fields instead of repurposing existing ones
2. it preserves `relationshipType`
3. it does not overwrite `CompanyLoi` or `CompanyOpportunity`
4. it leaves ambiguous historical preliminary signal as `UNKNOWN`
5. it allows product review of the mapped output before any UI or API write paths change

## Recommendation

Proceed in this order:

1. confirm the proposed `currentState` enum
2. confirm whether `preliminaryInterest` should stay structured as an enum with nullable storage until better source data exists
3. if confirmed, add the Prisma fields and a non-destructive backfill migration
4. only after validation, update the company write/read schemas

## Explicit Non-Goals

This proposal does not:

- modify pipeline boards
- modify venture studio or intake stage labels
- change screening matrix behavior
- change LOI sync logic
- change the intake/deals view
