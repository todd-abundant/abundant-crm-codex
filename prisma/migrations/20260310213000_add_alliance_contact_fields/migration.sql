-- AlterTable
ALTER TABLE "ContactHealthSystem"
ADD COLUMN "isKeyAllianceContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isInformedAllianceContact" BOOLEAN NOT NULL DEFAULT false;
