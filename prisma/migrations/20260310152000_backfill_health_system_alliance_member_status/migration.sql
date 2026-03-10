-- Backfill legacy rows where the boolean flag is true but enum is still set to NO.
UPDATE "HealthSystem"
SET "allianceMemberStatus" = 'YES'
WHERE "isAllianceMember" = true
  AND "allianceMemberStatus" = 'NO';
