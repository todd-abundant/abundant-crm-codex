-- CreateEnum
CREATE TYPE "PipelineCompanyType" AS ENUM ('DE_NOVO', 'SPIN_OUT', 'EARLY_STAGE');

-- CreateEnum
CREATE TYPE "PipelineFundingStage" AS ENUM ('PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'OTHER');

-- CreateEnum
CREATE TYPE "PipelineIntakeStep" AS ENUM ('INITIAL_CALL', 'DEEPER_DIVE', 'PROPOSAL_REVIEW', 'MANAGEMENT_PRESENTATION');

-- AlterTable
ALTER TABLE "CompanyPipeline"
  ADD COLUMN "pipelineCompanyType"      "PipelineCompanyType",
  ADD COLUMN "fundingStage"             "PipelineFundingStage",
  ADD COLUMN "amountRaising"            DECIMAL(16,2),
  ADD COLUMN "targetCustomer"           TEXT,
  ADD COLUMN "valueProp"                TEXT,
  ADD COLUMN "submittingHealthSystemId" TEXT,
  ADD COLUMN "intakeStep"               "PipelineIntakeStep";

-- AddForeignKey
ALTER TABLE "CompanyPipeline" ADD CONSTRAINT "CompanyPipeline_submittingHealthSystemId_fkey"
  FOREIGN KEY ("submittingHealthSystemId") REFERENCES "HealthSystem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
