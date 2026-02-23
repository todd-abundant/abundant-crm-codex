-- CreateEnum
CREATE TYPE "CompanyScreeningFeedbackSentiment" AS ENUM ('POSITIVE', 'MIXED', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "CompanyScreeningQuantitativeFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "contactId" TEXT,
    "metric" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "weightPercent" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningQuantitativeFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningQualitativeFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "contactId" TEXT,
    "theme" TEXT NOT NULL,
    "sentiment" "CompanyScreeningFeedbackSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningQualitativeFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyScreeningQuantitativeFeedback_companyId_healthSystemId_idx"
ON "CompanyScreeningQuantitativeFeedback"("companyId", "healthSystemId", "updatedAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningQuantitativeFeedback_contactId_idx"
ON "CompanyScreeningQuantitativeFeedback"("contactId");

-- CreateIndex
CREATE INDEX "CompanyScreeningQualitativeFeedback_companyId_healthSystemId_idx"
ON "CompanyScreeningQualitativeFeedback"("companyId", "healthSystemId", "updatedAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningQualitativeFeedback_contactId_idx"
ON "CompanyScreeningQualitativeFeedback"("contactId");

-- AddForeignKey
ALTER TABLE "CompanyScreeningQuantitativeFeedback"
ADD CONSTRAINT "CompanyScreeningQuantitativeFeedback_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningQuantitativeFeedback"
ADD CONSTRAINT "CompanyScreeningQuantitativeFeedback_healthSystemId_fkey"
FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningQuantitativeFeedback"
ADD CONSTRAINT "CompanyScreeningQuantitativeFeedback_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningQualitativeFeedback"
ADD CONSTRAINT "CompanyScreeningQualitativeFeedback_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningQualitativeFeedback"
ADD CONSTRAINT "CompanyScreeningQualitativeFeedback_healthSystemId_fkey"
FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningQualitativeFeedback"
ADD CONSTRAINT "CompanyScreeningQualitativeFeedback_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
