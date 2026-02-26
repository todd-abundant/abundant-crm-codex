-- AlterTable
ALTER TABLE "CompanyScreeningSurveyQuestion"
ADD COLUMN "instructions" TEXT;

-- AlterTable
ALTER TABLE "CompanyScreeningSurveySessionQuestion"
ADD COLUMN "instructionsOverride" TEXT;
