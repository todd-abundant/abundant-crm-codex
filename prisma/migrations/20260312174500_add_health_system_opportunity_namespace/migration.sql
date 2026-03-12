CREATE TABLE "HealthSystemOpportunity" (
    "id" TEXT NOT NULL,
    "legacyCompanyOpportunityId" TEXT,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT,
    "type" "CompanyOpportunityType" NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "CompanyOpportunityStage" NOT NULL DEFAULT 'IDENTIFIED',
    "likelihoodPercent" INTEGER,
    "contractPriceUsd" DECIMAL(16,2),
    "durationDays" INTEGER,
    "notes" TEXT,
    "nextSteps" TEXT,
    "closeReason" TEXT,
    "estimatedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthSystemOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthSystemOpportunityContact" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthSystemOpportunityContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthSystemOpportunity_legacyCompanyOpportunityId_key"
  ON "HealthSystemOpportunity"("legacyCompanyOpportunityId");

CREATE INDEX "HealthSystemOpportunity_companyId_type_idx"
  ON "HealthSystemOpportunity"("companyId", "type");

CREATE INDEX "HealthSystemOpportunity_healthSystemId_idx"
  ON "HealthSystemOpportunity"("healthSystemId");

CREATE INDEX "HealthSystemOpportunity_companyId_healthSystemId_type_stage_idx"
  ON "HealthSystemOpportunity"("companyId", "healthSystemId", "type", "stage");

CREATE UNIQUE INDEX "HealthSystemOpportunityContact_opportunityId_contactId_key"
  ON "HealthSystemOpportunityContact"("opportunityId", "contactId");

CREATE INDEX "HealthSystemOpportunityContact_contactId_idx"
  ON "HealthSystemOpportunityContact"("contactId");

CREATE INDEX "HealthSystemOpportunityContact_opportunityId_idx"
  ON "HealthSystemOpportunityContact"("opportunityId");

ALTER TABLE "HealthSystemOpportunity"
  ADD CONSTRAINT "HealthSystemOpportunity_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HealthSystemOpportunity"
  ADD CONSTRAINT "HealthSystemOpportunity_healthSystemId_fkey"
  FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HealthSystemOpportunityContact"
  ADD CONSTRAINT "HealthSystemOpportunityContact_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "HealthSystemOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HealthSystemOpportunityContact"
  ADD CONSTRAINT "HealthSystemOpportunityContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "HealthSystemOpportunity" (
  "id",
  "legacyCompanyOpportunityId",
  "companyId",
  "healthSystemId",
  "type",
  "title",
  "stage",
  "likelihoodPercent",
  "contractPriceUsd",
  "durationDays",
  "notes",
  "nextSteps",
  "closeReason",
  "estimatedCloseDate",
  "closedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  o."id",
  o."id",
  o."companyId",
  o."healthSystemId",
  o."type",
  o."title",
  o."stage",
  o."likelihoodPercent",
  o."contractPriceUsd",
  o."durationDays",
  o."notes",
  o."nextSteps",
  o."closeReason",
  o."estimatedCloseDate",
  o."closedAt",
  o."createdAt",
  o."updatedAt"
FROM "CompanyOpportunity" o
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "HealthSystemOpportunityContact" (
  "id",
  "opportunityId",
  "contactId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  c."id",
  c."opportunityId",
  c."contactId",
  c."role",
  c."createdAt",
  c."updatedAt"
FROM "CompanyOpportunityContact" c
INNER JOIN "HealthSystemOpportunity" o ON o."id" = c."opportunityId"
ON CONFLICT ("opportunityId", "contactId") DO NOTHING;
