-- AlterTable
ALTER TABLE "CompanyPipeline"
ADD COLUMN "nextStep" TEXT,
ADD COLUMN "ventureLikelihoodPercent" INTEGER,
ADD COLUMN "ventureExpectedCloseDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompanyPipelineNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPipelineNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyPipelineNote_companyId_createdAt_idx"
ON "CompanyPipelineNote"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyPipelineNote"
ADD CONSTRAINT "CompanyPipelineNote_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
