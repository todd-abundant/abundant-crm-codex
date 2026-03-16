-- CreateEnum
CREATE TYPE "StakeholderSignalsDigestDispatchStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "stakeholderDigestSubscribed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StakeholderSignalsDigestDispatch" (
    "id" TEXT NOT NULL,
    "digestKey" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "status" "StakeholderSignalsDigestDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "topItemsPerKind" INTEGER NOT NULL DEFAULT 3,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "homeUrl" TEXT,
    "summaryJson" JSONB,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderSignalsDigestDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderSignalsDigestDispatch_digestKey_key"
ON "StakeholderSignalsDigestDispatch"("digestKey");

-- CreateIndex
CREATE INDEX "StakeholderSignalsDigestDispatch_weekStart_weekEnd_idx"
ON "StakeholderSignalsDigestDispatch"("weekStart", "weekEnd");

-- CreateIndex
CREATE INDEX "StakeholderSignalsDigestDispatch_status_createdAt_idx"
ON "StakeholderSignalsDigestDispatch"("status", "createdAt");
