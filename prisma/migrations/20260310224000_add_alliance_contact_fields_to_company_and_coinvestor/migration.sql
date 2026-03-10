-- Add alliance contact flags to company and co-investor contact links.
ALTER TABLE "ContactCompany"
ADD COLUMN "isKeyAllianceContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isInformedAllianceContact" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ContactCoInvestor"
ADD COLUMN "isKeyAllianceContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isInformedAllianceContact" BOOLEAN NOT NULL DEFAULT false;
