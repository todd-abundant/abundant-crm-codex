-- CreateEnum
CREATE TYPE "ExternalMessageProvider" AS ENUM ('GMAIL');

-- CreateTable
CREATE TABLE "ExternalMessageCapture" (
    "id" TEXT NOT NULL,
    "provider" "ExternalMessageProvider" NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "internetMessageId" TEXT,
    "entityKind" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "noteId" TEXT,
    "capturedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalMessageCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMessageCapture_provider_externalMessageId_entityKind_entity_idx"
ON "ExternalMessageCapture"("provider", "externalMessageId", "entityKind", "entityId");

-- CreateIndex
CREATE INDEX "ExternalMessageCapture_entityKind_entityId_createdAt_idx"
ON "ExternalMessageCapture"("entityKind", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalMessageCapture_capturedByUserId_idx"
ON "ExternalMessageCapture"("capturedByUserId");

-- AddForeignKey
ALTER TABLE "ExternalMessageCapture"
ADD CONSTRAINT "ExternalMessageCapture_capturedByUserId_fkey"
FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
