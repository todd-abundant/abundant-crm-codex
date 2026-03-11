DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyPipelineCategory') THEN
    CREATE TYPE "CompanyPipelineCategory" AS ENUM ('ACTIVE', 'CLOSED', 'RE_ENGAGE_LATER');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyPipelineIntakeStage') THEN
    CREATE TYPE "CompanyPipelineIntakeStage" AS ENUM ('RECEIVED', 'INTRO_CALLS', 'ACTIVE_INTAKE', 'MANAGEMENT_PRESENTATION');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyClosedOutcome') THEN
    CREATE TYPE "CompanyClosedOutcome" AS ENUM ('INVESTED', 'PASSED', 'LOST', 'WITHDREW', 'OTHER');
  END IF;
END
$$;

ALTER TABLE "CompanyPipeline"
  ADD COLUMN IF NOT EXISTS "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "category" "CompanyPipelineCategory" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "intakeStage" "CompanyPipelineIntakeStage" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS "closedOutcome" "CompanyClosedOutcome",
  ADD COLUMN IF NOT EXISTS "nextStepDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastMeaningfulActivityAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ownerName" TEXT,
  ADD COLUMN IF NOT EXISTS "declineReasonNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "coInvestorEngagement" TEXT,
  ADD COLUMN IF NOT EXISTS "dealFlowContribution" TEXT;
