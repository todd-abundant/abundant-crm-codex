ALTER TYPE "CompanyScreeningCellField" ADD VALUE IF NOT EXISTS 'MEMBER_FEEDBACK_STATUS';

ALTER TABLE "CompanyOpportunity"
  ADD COLUMN IF NOT EXISTS "memberFeedbackStatus" TEXT;

ALTER TABLE "HealthSystemOpportunity"
  ADD COLUMN IF NOT EXISTS "memberFeedbackStatus" TEXT;
