-- Draft only. Do not run until mapping is confirmed.
-- Scope: additive relationship-schema change for CompanyHealthSystemLink.

-- 1. Enums
-- create type "CompanyHealthSystemPreliminaryInterest" as enum (
--   'UNKNOWN',
--   'EXPRESSED_INTEREST',
--   'REQUESTED_MORE_INFO',
--   'INTRO_CALL_SCHEDULED',
--   'SCREENING_RECOMMENDED'
-- );

-- create type "CompanyHealthSystemCurrentState" as enum (
--   'UNKNOWN',
--   'ACTIVE_SCREENING',
--   'LOI_SIGNED',
--   'CO_DEV',
--   'COMMERCIAL_AGREEMENT',
--   'PASSED',
--   'REVISIT'
-- );

-- 2. Additive columns
-- alter table "CompanyHealthSystemLink"
--   add column "preliminaryInterest" "CompanyHealthSystemPreliminaryInterest" not null default 'UNKNOWN',
--   add column "currentState" "CompanyHealthSystemCurrentState" not null default 'UNKNOWN';

-- 3. Backfill currentState from strongest available source first
-- Priority:
--   a) CompanyLoi.status
--   b) open SCREENING_LOI CompanyOpportunity.stage
--   c) latest SCREENING_LOI CompanyOpportunity.stage history

-- Suggested mapping:
-- SIGNED -> LOI_SIGNED
-- DECLINED -> PASSED
-- NEGOTIATING -> ACTIVE_SCREENING
-- PENDING -> ACTIVE_SCREENING
-- CLOSED_WON -> LOI_SIGNED
-- CLOSED_LOST -> PASSED
-- ON_HOLD -> REVISIT
-- IDENTIFIED / QUALIFICATION / PROPOSAL / NEGOTIATION / LEGAL -> ACTIVE_SCREENING

-- 4. Preliminary interest stays conservative for first pass
-- Unless there is a strong structured source, leave as UNKNOWN.
