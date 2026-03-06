-- CreateEnum
CREATE TYPE "CompanyReportType" AS ENUM ('INTAKE', 'SCREENING', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "CompanyReportStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "CompanyDocumentType" ADD VALUE IF NOT EXISTS 'OPPORTUNITY_REPORT';

-- CreateTable
CREATE TABLE "CompanyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyReportType" NOT NULL,
    "status" "CompanyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "audienceLabel" TEXT,
    "confidentialityLabel" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "sourceSnapshotJson" JSONB NOT NULL,
    "sectionStateJson" JSONB NOT NULL,
    "renderedHtml" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompanyReport" ADD CONSTRAINT "CompanyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReport" ADD CONSTRAINT "CompanyReport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CompanyReport_companyId_createdAt_idx" ON "CompanyReport"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyReport_companyId_type_status_createdAt_idx" ON "CompanyReport"("companyId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyReport_createdByUserId_idx" ON "CompanyReport"("createdByUserId");
