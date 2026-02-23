-- CreateEnum
CREATE TYPE "CompanyScreeningCellField" AS ENUM ('RELEVANT_FEEDBACK', 'STATUS_UPDATE');

-- CreateTable
CREATE TABLE "CompanyScreeningCellChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "field" "CompanyScreeningCellField" NOT NULL,
    "value" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyScreeningCellChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyScreeningCellChange_companyId_healthSystemId_field_cre_idx"
ON "CompanyScreeningCellChange"("companyId", "healthSystemId", "field", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningCellChange_changedByUserId_idx"
ON "CompanyScreeningCellChange"("changedByUserId");

-- AddForeignKey
ALTER TABLE "CompanyScreeningCellChange"
ADD CONSTRAINT "CompanyScreeningCellChange_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningCellChange"
ADD CONSTRAINT "CompanyScreeningCellChange_healthSystemId_fkey"
FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningCellChange"
ADD CONSTRAINT "CompanyScreeningCellChange_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
