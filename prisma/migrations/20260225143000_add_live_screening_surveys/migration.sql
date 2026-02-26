-- CreateEnum
CREATE TYPE "CompanyScreeningSurveySessionStatus" AS ENUM ('DRAFT', 'LIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "CompanyScreeningSurveyQuestion" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningSurveySession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "CompanyScreeningSurveySessionStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningSurveySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningSurveySessionQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryOverride" TEXT,
    "promptOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyScreeningSurveySessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningSurveySubmission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "healthSystemId" TEXT,
    "contactId" TEXT,
    "participantName" TEXT,
    "participantEmail" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceIpHash" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "CompanyScreeningSurveySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningSurveyAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyScreeningSurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyQuestion_category_isActive_idx"
ON "CompanyScreeningSurveyQuestion"("category", "isActive");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyQuestion_createdByUserId_idx"
ON "CompanyScreeningSurveyQuestion"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyScreeningSurveySession_accessToken_key"
ON "CompanyScreeningSurveySession"("accessToken");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySession_companyId_createdAt_idx"
ON "CompanyScreeningSurveySession"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySession_status_updatedAt_idx"
ON "CompanyScreeningSurveySession"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySession_createdByUserId_idx"
ON "CompanyScreeningSurveySession"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyScreeningSurveySessionQuestion_sessionId_questionId_key"
ON "CompanyScreeningSurveySessionQuestion"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySessionQuestion_sessionId_displayOrder_idx"
ON "CompanyScreeningSurveySessionQuestion"("sessionId", "displayOrder");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySessionQuestion_questionId_idx"
ON "CompanyScreeningSurveySessionQuestion"("questionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySubmission_sessionId_submittedAt_idx"
ON "CompanyScreeningSurveySubmission"("sessionId", "submittedAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySubmission_healthSystemId_idx"
ON "CompanyScreeningSurveySubmission"("healthSystemId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySubmission_contactId_idx"
ON "CompanyScreeningSurveySubmission"("contactId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySubmission_participantEmail_idx"
ON "CompanyScreeningSurveySubmission"("participantEmail");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyScreeningSurveyAnswer_submissionId_sessionQuestionId_key"
ON "CompanyScreeningSurveyAnswer"("submissionId", "sessionQuestionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyAnswer_sessionId_questionId_idx"
ON "CompanyScreeningSurveyAnswer"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyAnswer_sessionQuestionId_idx"
ON "CompanyScreeningSurveyAnswer"("sessionQuestionId");

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyQuestion"
ADD CONSTRAINT "CompanyScreeningSurveyQuestion_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySession"
ADD CONSTRAINT "CompanyScreeningSurveySession_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySession"
ADD CONSTRAINT "CompanyScreeningSurveySession_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySessionQuestion"
ADD CONSTRAINT "CompanyScreeningSurveySessionQuestion_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "CompanyScreeningSurveySession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySessionQuestion"
ADD CONSTRAINT "CompanyScreeningSurveySessionQuestion_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "CompanyScreeningSurveyQuestion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySubmission"
ADD CONSTRAINT "CompanyScreeningSurveySubmission_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "CompanyScreeningSurveySession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySubmission"
ADD CONSTRAINT "CompanyScreeningSurveySubmission_healthSystemId_fkey"
FOREIGN KEY ("healthSystemId") REFERENCES "HealthSystem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySubmission"
ADD CONSTRAINT "CompanyScreeningSurveySubmission_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD CONSTRAINT "CompanyScreeningSurveyAnswer_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "CompanyScreeningSurveySession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD CONSTRAINT "CompanyScreeningSurveyAnswer_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "CompanyScreeningSurveySubmission"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD CONSTRAINT "CompanyScreeningSurveyAnswer_sessionQuestionId_fkey"
FOREIGN KEY ("sessionQuestionId") REFERENCES "CompanyScreeningSurveySessionQuestion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD CONSTRAINT "CompanyScreeningSurveyAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "CompanyScreeningSurveyQuestion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
