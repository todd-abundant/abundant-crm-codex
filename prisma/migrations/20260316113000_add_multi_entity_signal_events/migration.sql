-- CreateTable
CREATE TABLE "HealthSystemSignalEvent" (
    "id" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
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

    CONSTRAINT "HealthSystemSignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySignalEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
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

    CONSTRAINT "CompanySignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSignalEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
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

    CONSTRAINT "ContactSignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthSystemSignalEvent_healthSystemId_dedupeKey_key"
ON "HealthSystemSignalEvent"("healthSystemId", "dedupeKey");

-- CreateIndex
CREATE INDEX "HealthSystemSignalEvent_healthSystemId_createdAt_idx"
ON "HealthSystemSignalEvent"("healthSystemId", "createdAt");

-- CreateIndex
CREATE INDEX "HealthSystemSignalEvent_eventType_createdAt_idx"
ON "HealthSystemSignalEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "HealthSystemSignalEvent_sourcePublishedAt_idx"
ON "HealthSystemSignalEvent"("sourcePublishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySignalEvent_companyId_dedupeKey_key"
ON "CompanySignalEvent"("companyId", "dedupeKey");

-- CreateIndex
CREATE INDEX "CompanySignalEvent_companyId_createdAt_idx"
ON "CompanySignalEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanySignalEvent_eventType_createdAt_idx"
ON "CompanySignalEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "CompanySignalEvent_sourcePublishedAt_idx"
ON "CompanySignalEvent"("sourcePublishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactSignalEvent_contactId_dedupeKey_key"
ON "ContactSignalEvent"("contactId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ContactSignalEvent_contactId_createdAt_idx"
ON "ContactSignalEvent"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactSignalEvent_eventType_createdAt_idx"
ON "ContactSignalEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ContactSignalEvent_sourcePublishedAt_idx"
ON "ContactSignalEvent"("sourcePublishedAt");

-- AddForeignKey
ALTER TABLE "HealthSystemSignalEvent"
ADD CONSTRAINT "HealthSystemSignalEvent_healthSystemId_fkey"
FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySignalEvent"
ADD CONSTRAINT "CompanySignalEvent_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSignalEvent"
ADD CONSTRAINT "ContactSignalEvent_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
