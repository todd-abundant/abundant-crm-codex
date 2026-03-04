-- AlterTable
ALTER TABLE "CompanyScreeningSurveyQuestion"
ADD COLUMN "isStandard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompanyScreeningSurveyTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyScreeningSurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyScreeningSurveyTemplateQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryOverride" TEXT,
    "promptOverride" TEXT,
    "instructionsOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyScreeningSurveyTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CompanyScreeningSurveySession"
ADD COLUMN "templateId" TEXT;

-- AlterTable
ALTER TABLE "CompanyScreeningSurveySessionQuestion"
ADD COLUMN "templateQuestionId" TEXT;

-- AlterTable
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD COLUMN "templateId" TEXT,
ADD COLUMN "templateQuestionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CompanyScreeningSurveyTemplate_key_key"
ON "CompanyScreeningSurveyTemplate"("key");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyTemplate_name_idx"
ON "CompanyScreeningSurveyTemplate"("name");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyTemplate_isActive_isStandard_idx"
ON "CompanyScreeningSurveyTemplate"("isActive", "isStandard");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyTemplate_createdByUserId_idx"
ON "CompanyScreeningSurveyTemplate"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyScreeningSurveyTemplateQuestion_templateId_questionId_key"
ON "CompanyScreeningSurveyTemplateQuestion"("templateId", "questionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyTemplateQuestion_templateId_displayOrder_idx"
ON "CompanyScreeningSurveyTemplateQuestion"("templateId", "displayOrder");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyTemplateQuestion_questionId_idx"
ON "CompanyScreeningSurveyTemplateQuestion"("questionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySession_templateId_createdAt_idx"
ON "CompanyScreeningSurveySession"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveySessionQuestion_templateQuestionId_idx"
ON "CompanyScreeningSurveySessionQuestion"("templateQuestionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyAnswer_templateId_questionId_idx"
ON "CompanyScreeningSurveyAnswer"("templateId", "questionId");

-- CreateIndex
CREATE INDEX "CompanyScreeningSurveyAnswer_templateId_templateQuestionId_idx"
ON "CompanyScreeningSurveyAnswer"("templateId", "templateQuestionId");

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyTemplate"
ADD CONSTRAINT "CompanyScreeningSurveyTemplate_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyTemplateQuestion"
ADD CONSTRAINT "CompanyScreeningSurveyTemplateQuestion_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "CompanyScreeningSurveyTemplate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyTemplateQuestion"
ADD CONSTRAINT "CompanyScreeningSurveyTemplateQuestion_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "CompanyScreeningSurveyQuestion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySession"
ADD CONSTRAINT "CompanyScreeningSurveySession_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "CompanyScreeningSurveyTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveySessionQuestion"
ADD CONSTRAINT "CompanyScreeningSurveySessionQuestion_templateQuestionId_fkey"
FOREIGN KEY ("templateQuestionId") REFERENCES "CompanyScreeningSurveyTemplateQuestion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD CONSTRAINT "CompanyScreeningSurveyAnswer_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "CompanyScreeningSurveyTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD CONSTRAINT "CompanyScreeningSurveyAnswer_templateQuestionId_fkey"
FOREIGN KEY ("templateQuestionId") REFERENCES "CompanyScreeningSurveyTemplateQuestion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
