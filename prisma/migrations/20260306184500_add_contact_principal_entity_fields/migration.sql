CREATE TYPE "ContactPrincipalEntityType" AS ENUM ('HEALTH_SYSTEM', 'CO_INVESTOR', 'COMPANY');

ALTER TABLE "Contact"
ADD COLUMN "principalEntityType" "ContactPrincipalEntityType",
ADD COLUMN "principalEntityId" TEXT;

CREATE INDEX "Contact_principalEntityType_principalEntityId_idx"
ON "Contact"("principalEntityType", "principalEntityId");
