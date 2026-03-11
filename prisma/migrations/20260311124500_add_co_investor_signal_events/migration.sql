-- CreateTable
CREATE TABLE "CoInvestorSignalEvent" (
    "id" TEXT NOT NULL,
    "coInvestorId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "suggestedOutreach" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "relevanceScore" INTEGER,
    "signalDate" TIMESTAMP(3),
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT,
    "sourceTitle" TEXT,
    "sourcePublishedAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoInvestorSignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoInvestorSignalEvent_coInvestorId_dedupeKey_key"
ON "CoInvestorSignalEvent"("coInvestorId", "dedupeKey");

-- CreateIndex
CREATE INDEX "CoInvestorSignalEvent_coInvestorId_createdAt_idx"
ON "CoInvestorSignalEvent"("coInvestorId", "createdAt");

-- CreateIndex
CREATE INDEX "CoInvestorSignalEvent_eventType_createdAt_idx"
ON "CoInvestorSignalEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "CoInvestorSignalEvent_sourcePublishedAt_idx"
ON "CoInvestorSignalEvent"("sourcePublishedAt");

-- AddForeignKey
ALTER TABLE "CoInvestorSignalEvent"
ADD CONSTRAINT "CoInvestorSignalEvent_coInvestorId_fkey"
FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
