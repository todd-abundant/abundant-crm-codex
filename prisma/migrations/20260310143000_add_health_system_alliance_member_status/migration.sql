-- CreateEnum
CREATE TYPE "AllianceMemberStatus" AS ENUM ('YES', 'NO', 'PROSPECT');

-- AlterTable
ALTER TABLE "HealthSystem"
ADD COLUMN "allianceMemberStatus" "AllianceMemberStatus" NOT NULL DEFAULT 'NO';

-- CreateIndex
CREATE INDEX "HealthSystem_allianceMemberStatus_idx"
ON "HealthSystem"("allianceMemberStatus");
