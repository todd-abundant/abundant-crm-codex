# Workbench Data Model Narrative

This document summarizes the CRM data model used by Workbench planning and execution.

## Core Entities

1. `HealthSystem`
- Represents health systems and health-system-level organizations.
- Key attributes include `name`, `website`, HQ fields, alliance/LP flags, and research metadata.
- One health system can be referenced as a lead source for many companies (`Company.leadSourceHealthSystemId`).

2. `Company`
- Represents startup/spinout/denovo companies.
- Has intake lifecycle, category, lead-source, and research metadata.
- Lead source semantics:
  - `leadSourceType = HEALTH_SYSTEM` means `leadSourceHealthSystemId` should reference a `HealthSystem` row.
  - `leadSourceType = OTHER` means `leadSourceOther` can hold the source text.

3. `CoInvestor`
- Represents investment firms/funds/co-investors.
- Tracks seed/series-A flags, investment notes, and research metadata.
- Distinct from `HealthSystem`.

## Relationship Tables

1. `CompanyHealthSystemLink`
- Many-to-many link between `Company` and `HealthSystem`.
- Stores `relationshipType`, optional notes, and optional economics.
- Use when the relationship itself is material and should be tracked independently of company lead source.

2. `CompanyCoInvestorLink`
- Many-to-many link between `Company` and `CoInvestor`.
- Stores `relationshipType`, optional notes, and optional `investmentAmountUsd`.
- This is the canonical way to represent co-investor relationships for companies.

## Contact Model

1. `Contact`
- Canonical person record.

2. Junction tables
- `ContactHealthSystem`
- `ContactCompany`
- `ContactCoInvestor`
- Each stores role-specific context (`roleType`, `title`) for that parent entity.

## Research/Workflow Tables

1. `HealthSystemResearchJob`
2. `CompanyResearchJob`
3. `CoInvestorResearchJob`

These are async enrichment pipelines and should not be used as business entities in planning logic.

## Modeling Rules For Workbench

1. A health system is not automatically a co-investor.
- If the narrative names a fund/arm (for example, innovation fund) as the investor, model that as `CoInvestor`.
- Otherwise keep the health system as `HealthSystem`.

2. "Introduced us to" usually implies lead source on company.
- Prefer `UPDATE_ENTITY` on `Company` to set `leadSourceType = HEALTH_SYSTEM` + `leadSourceHealthSystemId`.
- Add `CompanyHealthSystemLink` only when the relationship itself should be explicitly tracked.

3. Create entities before links.
- Any link step must depend on successful resolution/creation of both endpoint entities.

4. Avoid duplicates.
- If matching confidence is >=80%, default to using existing records instead of creating new ones.
