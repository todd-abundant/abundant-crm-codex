-- Add author attribution metadata to entity notes.
ALTER TABLE "EntityNote"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "createdByName" TEXT;

ALTER TABLE "EntityNote"
ADD CONSTRAINT "EntityNote_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "EntityNote_createdByUserId_idx" ON "EntityNote"("createdByUserId");
