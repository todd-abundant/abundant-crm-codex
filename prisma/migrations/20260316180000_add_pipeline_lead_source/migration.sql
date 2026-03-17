-- CreateEnum
CREATE TYPE "PipelineLeadSourceType" AS ENUM ('INSIDE_OUT', 'ALLIANCE_REFERRAL', 'CO_INVESTOR_REFERRAL', 'COLD_INBOUND', 'WARM_INTRO', 'OTHER');

-- CreateEnum
CREATE TYPE "PipelineLeadSourceEntityType" AS ENUM ('CONTACT', 'HEALTH_SYSTEM', 'CO_INVESTOR');

-- AlterTable
ALTER TABLE "CompanyPipeline" ADD COLUMN "leadSourceType" "PipelineLeadSourceType",
ADD COLUMN "leadSourceEntityType" "PipelineLeadSourceEntityType",
ADD COLUMN "leadSourceEntityId" TEXT,
ADD COLUMN "leadSourceEntityName" TEXT;
