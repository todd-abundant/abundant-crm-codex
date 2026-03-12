# Venture Studio vs Health System Opportunities Rollout

## Objective

Establish two explicit concepts throughout the platform:

- `Venture Studio Opportunity` for company-level pipeline progression (`CompanyPipeline` domain).
- `Health System Opportunity` for company-to-health-system opportunities (`HealthSystemOpportunity` domain).

## What shipped in this phase

1. New database structures for health-system opportunity namespace:
- `HealthSystemOpportunity`
- `HealthSystemOpportunityContact`

2. SQL backfill from legacy tables:
- `CompanyOpportunity` -> `HealthSystemOpportunity`
- `CompanyOpportunityContact` -> `HealthSystemOpportunityContact`

3. Dual-write for key write paths:
- Pipeline opportunity CRUD API
- Company pipeline bulk-save API
- Live screening survey auto-opportunity creation
- Contact-to-opportunity linking APIs
- Gmail add-on "add opportunity" flow

4. UI nomenclature updates in high-traffic surfaces to disambiguate:
- Venture Studio Pipeline labels
- Health System Opportunity labels

## Migration and deployment order (production)

1. Deploy schema migration only.
2. Confirm migration success and backfill row counts.
3. Deploy application code with dual-write enabled.
4. Monitor parity between legacy and new tables.
5. After parity is stable, switch read paths to `HealthSystemOpportunity` tables.
6. After read cutover and validation, deprecate legacy `CompanyOpportunity` tables.

## Recommended parity checks

Run these checks after deployment:

- Count parity:
  - `SELECT COUNT(*) FROM "CompanyOpportunity";`
  - `SELECT COUNT(*) FROM "HealthSystemOpportunity";`

- Contact link parity:
  - `SELECT COUNT(*) FROM "CompanyOpportunityContact";`
  - `SELECT COUNT(*) FROM "HealthSystemOpportunityContact";`

- Spot-check random IDs for field parity (`type`, `stage`, `healthSystemId`, `closeReason`, `closedAt`).

## Remaining work for full cutover

- Move read paths from legacy opportunity tables to `HealthSystemOpportunity` tables.
- Add reporting and reconciliation dashboard for legacy/new parity.
- Remove legacy table dependencies and finalize nomenclature in all remaining long-tail surfaces.
