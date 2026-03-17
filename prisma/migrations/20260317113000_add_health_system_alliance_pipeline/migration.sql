-- CreateEnum
CREATE TYPE "AlliancePipelineStage" AS ENUM ('PROSPECTING', 'QUALIFYING', 'PROPOSAL', 'CONTRACTING');

-- CreateEnum
CREATE TYPE "AlliancePipelineStatus" AS ENUM ('ACTIVE', 'CLOSED', 'REVISIT');

-- CreateEnum
CREATE TYPE "AlliancePipelineClosedOutcome" AS ENUM ('JOINED', 'PASSED', 'LOST', 'WITHDREW', 'OTHER');

-- CreateTable
CREATE TABLE "HealthSystemAlliancePipeline" (
    "id" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "stage" "AlliancePipelineStage" NOT NULL DEFAULT 'PROSPECTING',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AlliancePipelineStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedOutcome" "AlliancePipelineClosedOutcome",
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "ownerName" TEXT,
    "nextStep" TEXT,
    "nextStepDueAt" TIMESTAMP(3),
    "contractPriceUsd" DECIMAL(16,2),
    "likelihoodPercent" INTEGER,
    "estimatedCloseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSystemAlliancePipeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthSystemAlliancePipeline_healthSystemId_key" ON "HealthSystemAlliancePipeline"("healthSystemId");

-- CreateIndex
CREATE INDEX "HealthSystemAlliancePipeline_status_stage_idx" ON "HealthSystemAlliancePipeline"("status", "stage");

-- CreateIndex
CREATE INDEX "HealthSystemAlliancePipeline_ownerName_idx" ON "HealthSystemAlliancePipeline"("ownerName");

-- CreateIndex
CREATE INDEX "HealthSystemAlliancePipeline_estimatedCloseDate_idx" ON "HealthSystemAlliancePipeline"("estimatedCloseDate");

-- AddForeignKey
ALTER TABLE "HealthSystemAlliancePipeline" ADD CONSTRAINT "HealthSystemAlliancePipeline_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing alliance prospects into the new pipeline.
INSERT INTO "HealthSystemAlliancePipeline" (
    "id",
    "healthSystemId",
    "stage",
    "stageChangedAt",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "id",
    'PROSPECTING'::"AlliancePipelineStage",
    COALESCE("researchUpdatedAt", "updatedAt", CURRENT_TIMESTAMP),
    'ACTIVE'::"AlliancePipelineStatus",
    COALESCE("createdAt", CURRENT_TIMESTAMP),
    COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "HealthSystem"
WHERE "allianceMemberStatus" = 'PROSPECT'
ON CONFLICT ("healthSystemId") DO NOTHING;
