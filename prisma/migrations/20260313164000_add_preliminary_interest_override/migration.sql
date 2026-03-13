ALTER TABLE "CompanyOpportunity"
  ADD COLUMN IF NOT EXISTS "preliminaryInterestOverride" TEXT;

ALTER TABLE "HealthSystemOpportunity"
  ADD COLUMN IF NOT EXISTS "preliminaryInterestOverride" TEXT;
