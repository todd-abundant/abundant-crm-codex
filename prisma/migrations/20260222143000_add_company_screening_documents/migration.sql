-- CreateTable
CREATE TABLE "CompanyScreeningDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyScreeningDocument_companyId_healthSystemId_uploadedAt_idx"
ON "CompanyScreeningDocument"("companyId", "healthSystemId", "uploadedAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningDocument_healthSystemId_idx"
ON "CompanyScreeningDocument"("healthSystemId");

-- AddForeignKey
ALTER TABLE "CompanyScreeningDocument"
ADD CONSTRAINT "CompanyScreeningDocument_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningDocument"
ADD CONSTRAINT "CompanyScreeningDocument_healthSystemId_fkey"
FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
