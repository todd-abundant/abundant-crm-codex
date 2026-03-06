-- Add Screening-specific opportunity type
ALTER TYPE "CompanyOpportunityType" ADD VALUE IF NOT EXISTS 'SCREENING_LOI';

-- Expand opportunity lifecycle fields
ALTER TABLE "CompanyOpportunity"
  ADD COLUMN "contractPriceUsd" DECIMAL(16,2),
  ADD COLUMN "durationDays" INTEGER,
  ADD COLUMN "closeReason" TEXT;

-- Link opportunities to one or more contracting contacts
CREATE TABLE "CompanyOpportunityContact" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "role" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyOpportunityContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyOpportunityContact_opportunityId_contactId_key"
  ON "CompanyOpportunityContact"("opportunityId", "contactId");

CREATE INDEX "CompanyOpportunityContact_contactId_idx"
  ON "CompanyOpportunityContact"("contactId");

ALTER TABLE "CompanyOpportunityContact"
  ADD CONSTRAINT "CompanyOpportunityContact_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "CompanyOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyOpportunityContact"
  ADD CONSTRAINT "CompanyOpportunityContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mark one session question as the automatic Screening opportunity trigger
ALTER TABLE "CompanyScreeningSurveySessionQuestion"
  ADD COLUMN "drivesScreeningOpportunity" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CompanyOpportunity_companyId_healthSystemId_type_stage_idx"
  ON "CompanyOpportunity"("companyId", "healthSystemId", "type", "stage");
