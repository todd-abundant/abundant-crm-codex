-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('HEALTH_SYSTEM', 'CO_INVESTOR', 'COMPANY');

-- CreateTable
CREATE TABLE "EntityDocument" (
    "id" TEXT NOT NULL,
    "entityKind" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityNote" (
    "id" TEXT NOT NULL,
    "entityKind" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityNoteDocument" (
    "noteId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityNoteDocument_pkey" PRIMARY KEY ("noteId","documentId")
);

-- CreateIndex
CREATE INDEX "EntityDocument_entityKind_entityId_uploadedAt_idx"
ON "EntityDocument"("entityKind", "entityId", "uploadedAt");

-- CreateIndex
CREATE INDEX "EntityDocument_entityKind_entityId_createdAt_idx"
ON "EntityDocument"("entityKind", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "EntityNote_entityKind_entityId_createdAt_idx"
ON "EntityNote"("entityKind", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "EntityNoteDocument_documentId_idx"
ON "EntityNoteDocument"("documentId");

-- AddForeignKey
ALTER TABLE "EntityNoteDocument"
ADD CONSTRAINT "EntityNoteDocument_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "EntityNote"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityNoteDocument"
ADD CONSTRAINT "EntityNoteDocument_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "EntityDocument"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
