DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CompanyHealthSystemPreliminaryInterest'
  ) THEN
    CREATE TYPE "CompanyHealthSystemPreliminaryInterest" AS ENUM (
      'EXPRESSED_INTEREST',
      'REQUESTED_MORE_INFO',
      'INTRO_CALL_SCHEDULED',
      'SCREENING_RECOMMENDED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CompanyHealthSystemCurrentState'
  ) THEN
    CREATE TYPE "CompanyHealthSystemCurrentState" AS ENUM (
      'ACTIVE_SCREENING',
      'LOI_SIGNED',
      'CO_DEV',
      'COMMERCIAL_AGREEMENT',
      'PASSED',
      'REVISIT'
    );
  END IF;
END
$$;

ALTER TABLE "CompanyHealthSystemLink"
  ADD COLUMN IF NOT EXISTS "preliminaryInterest" "CompanyHealthSystemPreliminaryInterest",
  ADD COLUMN IF NOT EXISTS "currentState" "CompanyHealthSystemCurrentState";

CREATE INDEX IF NOT EXISTS "CompanyHealthSystemLink_preliminaryInterest_idx"
  ON "CompanyHealthSystemLink"("preliminaryInterest");

CREATE INDEX IF NOT EXISTS "CompanyHealthSystemLink_currentState_idx"
  ON "CompanyHealthSystemLink"("currentState");

UPDATE "CompanyHealthSystemLink" AS link
SET "currentState" = CASE loi.status
  WHEN 'SIGNED' THEN 'LOI_SIGNED'::"CompanyHealthSystemCurrentState"
  WHEN 'DECLINED' THEN 'PASSED'::"CompanyHealthSystemCurrentState"
  WHEN 'NEGOTIATING' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  WHEN 'PENDING' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  ELSE NULL
END
FROM "CompanyLoi" AS loi
WHERE loi."companyId" = link."companyId"
  AND loi."healthSystemId" = link."healthSystemId"
  AND link."currentState" IS NULL;

WITH ranked_opportunities AS (
  SELECT DISTINCT ON (opp."companyId", opp."healthSystemId")
    opp."companyId",
    opp."healthSystemId",
    opp.stage
  FROM "CompanyOpportunity" AS opp
  WHERE opp.type = 'SCREENING_LOI'
    AND opp."healthSystemId" IS NOT NULL
  ORDER BY
    opp."companyId",
    opp."healthSystemId",
    CASE WHEN opp.stage IN ('CLOSED_WON', 'CLOSED_LOST') THEN 1 ELSE 0 END,
    opp."updatedAt" DESC,
    opp."createdAt" DESC
)
UPDATE "CompanyHealthSystemLink" AS link
SET "currentState" = CASE ranked.stage
  WHEN 'CLOSED_WON' THEN 'LOI_SIGNED'::"CompanyHealthSystemCurrentState"
  WHEN 'CLOSED_LOST' THEN 'PASSED'::"CompanyHealthSystemCurrentState"
  WHEN 'ON_HOLD' THEN 'REVISIT'::"CompanyHealthSystemCurrentState"
  WHEN 'IDENTIFIED' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  WHEN 'QUALIFICATION' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  WHEN 'PROPOSAL' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  WHEN 'NEGOTIATION' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  WHEN 'LEGAL' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
  ELSE link."currentState"
END
FROM ranked_opportunities AS ranked
WHERE ranked."companyId" = link."companyId"
  AND ranked."healthSystemId" = link."healthSystemId"
  AND link."currentState" IS NULL;
