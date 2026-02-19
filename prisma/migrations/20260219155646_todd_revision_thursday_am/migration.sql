-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CoInvestorResearchStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('STARTUP', 'SPIN_OUT', 'DENOVO');

-- CreateEnum
CREATE TYPE "CompanyPrimaryCategory" AS ENUM ('PATIENT_ACCESS_AND_GROWTH', 'CARE_DELIVERY_TECH_ENABLED_SERVICES', 'CLINICAL_WORKFLOW_AND_PRODUCTIVITY', 'REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS', 'VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT', 'AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT', 'DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION', 'REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES', 'DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT', 'PHARMACY_AND_MEDICATION_ENABLEMENT', 'SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS', 'SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE', 'PROVIDER_EXPERIENCE_AND_DEVELOPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyDeclineReason" AS ENUM ('PRODUCT', 'INSUFFICIENT_ROI', 'HIGHLY_COMPETITIVE_LANDSCAPE', 'OUT_OF_INVESTMENT_THESIS_SCOPE', 'TOO_EARLY', 'TOO_MATURE_FOR_SEED_INVESTMENT', 'LACKS_PROOF_POINTS', 'INSUFFICIENT_TAM', 'TEAM', 'HEALTH_SYSTEM_BUYING_PROCESS', 'WORKFLOW_FRICTION', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyIntakeStatus" AS ENUM ('NOT_SCHEDULED', 'SCHEDULED', 'COMPLETED', 'SCREENING_EVALUATION');

-- CreateEnum
CREATE TYPE "CompanyLeadSourceType" AS ENUM ('HEALTH_SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyHealthSystemRelationship" AS ENUM ('CUSTOMER', 'SPIN_OUT_PARTNER', 'INVESTOR_PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyCoInvestorRelationship" AS ENUM ('INVESTOR', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactRoleType" AS ENUM ('EXECUTIVE', 'VENTURE_PARTNER', 'INVESTOR_PARTNER', 'COMPANY_CONTACT', 'OTHER');

-- CreateTable
CREATE TABLE "HealthSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "headquartersCity" TEXT,
    "headquartersState" TEXT,
    "headquartersCountry" TEXT,
    "netPatientRevenueUsd" DECIMAL(16,2),
    "isLimitedPartner" BOOLEAN NOT NULL DEFAULT false,
    "limitedPartnerInvestmentUsd" DECIMAL(16,2),
    "isAllianceMember" BOOLEAN NOT NULL DEFAULT false,
    "hasInnovationTeam" BOOLEAN,
    "hasVentureTeam" BOOLEAN,
    "ventureTeamSummary" TEXT,
    "researchStatus" "ResearchStatus" NOT NULL DEFAULT 'DRAFT',
    "researchNotes" TEXT,
    "researchError" TEXT,
    "researchUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Executive" (
    "id" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "linkedinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Executive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenturePartner" (
    "id" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coInvestorId" TEXT,
    "title" TEXT,
    "profileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenturePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSystemInvestment" (
    "id" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "portfolioCompanyName" TEXT NOT NULL,
    "companyId" TEXT,
    "investmentAmountUsd" DECIMAL(16,2),
    "investmentDate" TIMESTAMP(3),
    "leadPartnerName" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthSystemInvestment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSystemResearchJob" (
    "id" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'QUEUED',
    "searchName" TEXT NOT NULL,
    "selectedCity" TEXT,
    "selectedState" TEXT,
    "selectedCountry" TEXT,
    "selectedWebsite" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSystemResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoInvestor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "headquartersCity" TEXT,
    "headquartersState" TEXT,
    "headquartersCountry" TEXT,
    "isSeedInvestor" BOOLEAN NOT NULL DEFAULT false,
    "isSeriesAInvestor" BOOLEAN NOT NULL DEFAULT false,
    "investmentNotes" TEXT,
    "researchStatus" "CoInvestorResearchStatus" NOT NULL DEFAULT 'DRAFT',
    "researchNotes" TEXT,
    "researchError" TEXT,
    "researchUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoInvestor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoInvestorPartner" (
    "id" TEXT NOT NULL,
    "coInvestorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "profileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoInvestorPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoInvestorInvestment" (
    "id" TEXT NOT NULL,
    "coInvestorId" TEXT NOT NULL,
    "portfolioCompanyName" TEXT NOT NULL,
    "investmentAmountUsd" DECIMAL(16,2),
    "investmentDate" TIMESTAMP(3),
    "investmentStage" TEXT,
    "leadPartnerName" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoInvestorInvestment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoInvestorResearchJob" (
    "id" TEXT NOT NULL,
    "coInvestorId" TEXT NOT NULL,
    "status" "CoInvestorResearchStatus" NOT NULL DEFAULT 'QUEUED',
    "searchName" TEXT NOT NULL,
    "selectedCity" TEXT,
    "selectedState" TEXT,
    "selectedCountry" TEXT,
    "selectedWebsite" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoInvestorResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "headquartersCity" TEXT,
    "headquartersState" TEXT,
    "headquartersCountry" TEXT,
    "companyType" "CompanyType" NOT NULL DEFAULT 'STARTUP',
    "primaryCategory" "CompanyPrimaryCategory" NOT NULL DEFAULT 'OTHER',
    "primaryCategoryOther" TEXT,
    "declineReason" "CompanyDeclineReason",
    "declineReasonOther" TEXT,
    "leadSourceType" "CompanyLeadSourceType" NOT NULL DEFAULT 'OTHER',
    "leadSourceHealthSystemId" TEXT,
    "leadSourceOther" TEXT,
    "leadSourceNotes" TEXT,
    "description" TEXT,
    "googleTranscriptUrl" TEXT,
    "spinOutOwnershipPercent" DECIMAL(7,2),
    "intakeStatus" "CompanyIntakeStatus" NOT NULL DEFAULT 'NOT_SCHEDULED',
    "intakeScheduledAt" TIMESTAMP(3),
    "screeningEvaluationAt" TIMESTAMP(3),
    "researchStatus" "ResearchStatus" NOT NULL DEFAULT 'DRAFT',
    "researchNotes" TEXT,
    "researchError" TEXT,
    "researchUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHealthSystemLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "relationshipType" "CompanyHealthSystemRelationship" NOT NULL DEFAULT 'CUSTOMER',
    "notes" TEXT,
    "investmentAmountUsd" DECIMAL(16,2),
    "ownershipPercent" DECIMAL(7,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHealthSystemLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCoInvestorLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "coInvestorId" TEXT NOT NULL,
    "relationshipType" "CompanyCoInvestorRelationship" NOT NULL DEFAULT 'INVESTOR',
    "notes" TEXT,
    "investmentAmountUsd" DECIMAL(16,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCoInvestorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyResearchJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'QUEUED',
    "searchName" TEXT NOT NULL,
    "selectedCity" TEXT,
    "selectedState" TEXT,
    "selectedCountry" TEXT,
    "selectedWebsite" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactHealthSystem" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "roleType" "ContactRoleType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactHealthSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactCompany" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleType" "ContactRoleType" NOT NULL DEFAULT 'COMPANY_CONTACT',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactCoInvestor" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "coInvestorId" TEXT NOT NULL,
    "roleType" "ContactRoleType" NOT NULL DEFAULT 'INVESTOR_PARTNER',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactCoInvestor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthSystem_name_idx" ON "HealthSystem"("name");

-- CreateIndex
CREATE INDEX "HealthSystem_isAllianceMember_idx" ON "HealthSystem"("isAllianceMember");

-- CreateIndex
CREATE INDEX "HealthSystem_isLimitedPartner_idx" ON "HealthSystem"("isLimitedPartner");

-- CreateIndex
CREATE INDEX "HealthSystem_researchStatus_idx" ON "HealthSystem"("researchStatus");

-- CreateIndex
CREATE INDEX "HealthSystem_website_idx" ON "HealthSystem"("website");

-- CreateIndex
CREATE INDEX "HealthSystem_headquartersCity_headquartersState_headquarter_idx" ON "HealthSystem"("headquartersCity", "headquartersState", "headquartersCountry");

-- CreateIndex
CREATE INDEX "Executive_healthSystemId_idx" ON "Executive"("healthSystemId");

-- CreateIndex
CREATE INDEX "VenturePartner_healthSystemId_idx" ON "VenturePartner"("healthSystemId");

-- CreateIndex
CREATE INDEX "VenturePartner_coInvestorId_idx" ON "VenturePartner"("coInvestorId");

-- CreateIndex
CREATE INDEX "HealthSystemInvestment_healthSystemId_idx" ON "HealthSystemInvestment"("healthSystemId");

-- CreateIndex
CREATE INDEX "HealthSystemInvestment_companyId_idx" ON "HealthSystemInvestment"("companyId");

-- CreateIndex
CREATE INDEX "HealthSystemInvestment_portfolioCompanyName_idx" ON "HealthSystemInvestment"("portfolioCompanyName");

-- CreateIndex
CREATE INDEX "HealthSystemResearchJob_status_createdAt_idx" ON "HealthSystemResearchJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HealthSystemResearchJob_healthSystemId_createdAt_idx" ON "HealthSystemResearchJob"("healthSystemId", "createdAt");

-- CreateIndex
CREATE INDEX "CoInvestor_name_idx" ON "CoInvestor"("name");

-- CreateIndex
CREATE INDEX "CoInvestor_isSeedInvestor_idx" ON "CoInvestor"("isSeedInvestor");

-- CreateIndex
CREATE INDEX "CoInvestor_isSeriesAInvestor_idx" ON "CoInvestor"("isSeriesAInvestor");

-- CreateIndex
CREATE INDEX "CoInvestor_researchStatus_idx" ON "CoInvestor"("researchStatus");

-- CreateIndex
CREATE INDEX "CoInvestorPartner_coInvestorId_idx" ON "CoInvestorPartner"("coInvestorId");

-- CreateIndex
CREATE INDEX "CoInvestorInvestment_coInvestorId_idx" ON "CoInvestorInvestment"("coInvestorId");

-- CreateIndex
CREATE INDEX "CoInvestorInvestment_portfolioCompanyName_idx" ON "CoInvestorInvestment"("portfolioCompanyName");

-- CreateIndex
CREATE INDEX "CoInvestorResearchJob_status_createdAt_idx" ON "CoInvestorResearchJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CoInvestorResearchJob_coInvestorId_createdAt_idx" ON "CoInvestorResearchJob"("coInvestorId", "createdAt");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_companyType_idx" ON "Company"("companyType");

-- CreateIndex
CREATE INDEX "Company_primaryCategory_idx" ON "Company"("primaryCategory");

-- CreateIndex
CREATE INDEX "Company_leadSourceType_idx" ON "Company"("leadSourceType");

-- CreateIndex
CREATE INDEX "Company_leadSourceHealthSystemId_idx" ON "Company"("leadSourceHealthSystemId");

-- CreateIndex
CREATE INDEX "Company_intakeStatus_idx" ON "Company"("intakeStatus");

-- CreateIndex
CREATE INDEX "Company_researchStatus_idx" ON "Company"("researchStatus");

-- CreateIndex
CREATE INDEX "CompanyHealthSystemLink_companyId_healthSystemId_idx" ON "CompanyHealthSystemLink"("companyId", "healthSystemId");

-- CreateIndex
CREATE INDEX "CompanyCoInvestorLink_companyId_coInvestorId_idx" ON "CompanyCoInvestorLink"("companyId", "coInvestorId");

-- CreateIndex
CREATE INDEX "CompanyResearchJob_status_createdAt_idx" ON "CompanyResearchJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyResearchJob_companyId_createdAt_idx" ON "CompanyResearchJob"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "ContactHealthSystem_contactId_idx" ON "ContactHealthSystem"("contactId");

-- CreateIndex
CREATE INDEX "ContactHealthSystem_healthSystemId_idx" ON "ContactHealthSystem"("healthSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactHealthSystem_contactId_healthSystemId_roleType_key" ON "ContactHealthSystem"("contactId", "healthSystemId", "roleType");

-- CreateIndex
CREATE INDEX "ContactCompany_contactId_idx" ON "ContactCompany"("contactId");

-- CreateIndex
CREATE INDEX "ContactCompany_companyId_idx" ON "ContactCompany"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactCompany_contactId_companyId_roleType_key" ON "ContactCompany"("contactId", "companyId", "roleType");

-- CreateIndex
CREATE INDEX "ContactCoInvestor_contactId_idx" ON "ContactCoInvestor"("contactId");

-- CreateIndex
CREATE INDEX "ContactCoInvestor_coInvestorId_idx" ON "ContactCoInvestor"("coInvestorId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactCoInvestor_contactId_coInvestorId_roleType_key" ON "ContactCoInvestor"("contactId", "coInvestorId", "roleType");

-- AddForeignKey
ALTER TABLE "Executive" ADD CONSTRAINT "Executive_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenturePartner" ADD CONSTRAINT "VenturePartner_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenturePartner" ADD CONSTRAINT "VenturePartner_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSystemInvestment" ADD CONSTRAINT "HealthSystemInvestment_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSystemInvestment" ADD CONSTRAINT "HealthSystemInvestment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSystemResearchJob" ADD CONSTRAINT "HealthSystemResearchJob_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoInvestorPartner" ADD CONSTRAINT "CoInvestorPartner_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoInvestorInvestment" ADD CONSTRAINT "CoInvestorInvestment_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoInvestorResearchJob" ADD CONSTRAINT "CoInvestorResearchJob_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_leadSourceHealthSystemId_fkey" FOREIGN KEY ("leadSourceHealthSystemId") REFERENCES "HealthSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHealthSystemLink" ADD CONSTRAINT "CompanyHealthSystemLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHealthSystemLink" ADD CONSTRAINT "CompanyHealthSystemLink_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCoInvestorLink" ADD CONSTRAINT "CompanyCoInvestorLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCoInvestorLink" ADD CONSTRAINT "CompanyCoInvestorLink_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyResearchJob" ADD CONSTRAINT "CompanyResearchJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactHealthSystem" ADD CONSTRAINT "ContactHealthSystem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactHealthSystem" ADD CONSTRAINT "ContactHealthSystem_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCompany" ADD CONSTRAINT "ContactCompany_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCompany" ADD CONSTRAINT "ContactCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCoInvestor" ADD CONSTRAINT "ContactCoInvestor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCoInvestor" ADD CONSTRAINT "ContactCoInvestor_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
