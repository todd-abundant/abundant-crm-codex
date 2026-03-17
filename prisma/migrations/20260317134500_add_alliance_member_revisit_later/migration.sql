ALTER TYPE "AllianceMemberStatus" ADD VALUE 'REVISIT_LATER';

UPDATE "HealthSystem" AS hs
SET
  "allianceMemberStatus" = 'REVISIT_LATER',
  "isAllianceMember" = FALSE
FROM "HealthSystemAlliancePipeline" AS pipeline
WHERE pipeline."healthSystemId" = hs."id"
  AND pipeline."status" = 'REVISIT';
