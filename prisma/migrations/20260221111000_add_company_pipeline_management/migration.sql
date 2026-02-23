-- CreateEnum
CREATE TYPE "CompanyPipelinePhase" AS ENUM ('INTAKE', 'DECLINED', 'VENTURE_STUDIO_NEGOTIATION', 'SCREENING', 'LOI_COLLECTION', 'COMMERCIAL_NEGOTIATION', 'PORTFOLIO_GROWTH');

-- CreateEnum
CREATE TYPE "CompanyIntakeDecision" AS ENUM ('PENDING', 'ADVANCE_TO_NEGOTIATION', 'DECLINE');

-- CreateEnum
CREATE TYPE "CompanyDocumentType" AS ENUM ('INTAKE_REPORT', 'SCREENING_REPORT', 'TERM_SHEET', 'VENTURE_STUDIO_CONTRACT', 'LOI', 'COMMERCIAL_CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyOpportunityType" AS ENUM ('VENTURE_STUDIO_SERVICES', 'S1_TERM_SHEET', 'COMMERCIAL_CONTRACT', 'PROSPECT_PURSUIT');

-- CreateEnum
CREATE TYPE "CompanyOpportunityStage" AS ENUM ('IDENTIFIED', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'LEGAL', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "CompanyScreeningEventType" AS ENUM ('WEBINAR', 'INDIVIDUAL_SESSION', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyScreeningAttendanceStatus" AS ENUM ('INVITED', 'ATTENDED', 'DECLINED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CompanyLoiStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'NEGOTIATING', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CompanyFundraiseStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CompanyPipeline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phase" "CompanyPipelinePhase" NOT NULL DEFAULT 'INTAKE',
    "intakeDecision" "CompanyIntakeDecision" NOT NULL DEFAULT 'PENDING',
    "intakeDecisionAt" TIMESTAMP(3),
    "intakeDecisionNotes" TEXT,
    "ventureStudioContractExecutedAt" TIMESTAMP(3),
    "targetLoiCount" INTEGER NOT NULL DEFAULT 3,
    "s1Invested" BOOLEAN NOT NULL DEFAULT false,
    "s1InvestmentAt" TIMESTAMP(3),
    "s1InvestmentAmountUsd" DECIMAL(16,2),
    "portfolioAddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyDocumentType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyOpportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT,
    "type" "CompanyOpportunityType" NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "CompanyOpportunityStage" NOT NULL DEFAULT 'IDENTIFIED',
    "likelihoodPercent" INTEGER,
    "amountUsd" DECIMAL(16,2),
    "notes" TEXT,
    "nextSteps" TEXT,
    "estimatedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyScreeningEventType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningParticipant" (
    "id" TEXT NOT NULL,
    "screeningEventId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "contactId" TEXT,
    "attendanceStatus" "CompanyScreeningAttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLoi" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthSystemId" TEXT NOT NULL,
    "status" "CompanyLoiStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "signedAt" TIMESTAMP(3),
    "notes" TEXT,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyLoi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFundraise" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roundLabel" TEXT NOT NULL,
    "status" "CompanyFundraiseStatus" NOT NULL DEFAULT 'PLANNED',
    "totalAmountUsd" DECIMAL(16,2),
    "s1InvestmentUsd" DECIMAL(16,2),
    "announcedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFundraise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFundraiseInvestor" (
    "id" TEXT NOT NULL,
    "fundraiseId" TEXT NOT NULL,
    "coInvestorId" TEXT,
    "investorName" TEXT NOT NULL,
    "investmentAmountUsd" DECIMAL(16,2),
    "isLeadInvestor" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFundraiseInvestor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPipeline_companyId_key" ON "CompanyPipeline"("companyId");

-- CreateIndex
CREATE INDEX "CompanyPipeline_phase_idx" ON "CompanyPipeline"("phase");

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_type_idx" ON "CompanyDocument"("companyId", "type");

-- CreateIndex
CREATE INDEX "CompanyOpportunity_companyId_type_idx" ON "CompanyOpportunity"("companyId", "type");

-- CreateIndex
CREATE INDEX "CompanyOpportunity_healthSystemId_idx" ON "CompanyOpportunity"("healthSystemId");

-- CreateIndex
CREATE INDEX "CompanyScreeningEvent_companyId_type_idx" ON "CompanyScreeningEvent"("companyId", "type");

-- CreateIndex
CREATE INDEX "CompanyScreeningParticipant_screeningEventId_attendanceStatus_idx" ON "CompanyScreeningParticipant"("screeningEventId", "attendanceStatus");

-- CreateIndex
CREATE INDEX "CompanyScreeningParticipant_healthSystemId_idx" ON "CompanyScreeningParticipant"("healthSystemId");

-- CreateIndex
CREATE INDEX "CompanyScreeningParticipant_contactId_idx" ON "CompanyScreeningParticipant"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLoi_companyId_healthSystemId_key" ON "CompanyLoi"("companyId", "healthSystemId");

-- CreateIndex
CREATE INDEX "CompanyLoi_companyId_status_idx" ON "CompanyLoi"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyFundraise_companyId_status_idx" ON "CompanyFundraise"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyFundraiseInvestor_fundraiseId_idx" ON "CompanyFundraiseInvestor"("fundraiseId");

-- CreateIndex
CREATE INDEX "CompanyFundraiseInvestor_coInvestorId_idx" ON "CompanyFundraiseInvestor"("coInvestorId");

-- AddForeignKey
ALTER TABLE "CompanyPipeline" ADD CONSTRAINT "CompanyPipeline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOpportunity" ADD CONSTRAINT "CompanyOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOpportunity" ADD CONSTRAINT "CompanyOpportunity_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningEvent" ADD CONSTRAINT "CompanyScreeningEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningParticipant" ADD CONSTRAINT "CompanyScreeningParticipant_screeningEventId_fkey" FOREIGN KEY ("screeningEventId") REFERENCES "CompanyScreeningEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningParticipant" ADD CONSTRAINT "CompanyScreeningParticipant_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningParticipant" ADD CONSTRAINT "CompanyScreeningParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLoi" ADD CONSTRAINT "CompanyLoi_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLoi" ADD CONSTRAINT "CompanyLoi_healthSystemId_fkey" FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFundraise" ADD CONSTRAINT "CompanyFundraise_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFundraiseInvestor" ADD CONSTRAINT "CompanyFundraiseInvestor_fundraiseId_fkey" FOREIGN KEY ("fundraiseId") REFERENCES "CompanyFundraise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFundraiseInvestor" ADD CONSTRAINT "CompanyFundraiseInvestor_coInvestorId_fkey" FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
