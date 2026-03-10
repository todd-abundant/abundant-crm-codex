UPDATE "CompanyOpportunity"
SET "contractPriceUsd" = "amountUsd"
WHERE "contractPriceUsd" IS NULL
  AND "amountUsd" IS NOT NULL;

ALTER TABLE "CompanyOpportunity"
DROP COLUMN "amountUsd";
