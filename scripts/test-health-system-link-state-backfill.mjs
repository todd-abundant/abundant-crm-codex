#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const scenarioKey = `link-state-backfill-${Date.now()}`;

  try {
    await prisma.$transaction(async (tx) => {
      const [company, hsSigned, hsPassed, hsRevisit, hsActive] = await Promise.all([
        tx.company.create({
          data: { name: `Backfill Scenario Company ${scenarioKey}` },
          select: { id: true, name: true }
        }),
        tx.healthSystem.create({ data: { name: `HS Signed ${scenarioKey}` }, select: { id: true, name: true } }),
        tx.healthSystem.create({ data: { name: `HS Passed ${scenarioKey}` }, select: { id: true, name: true } }),
        tx.healthSystem.create({ data: { name: `HS Revisit ${scenarioKey}` }, select: { id: true, name: true } }),
        tx.healthSystem.create({ data: { name: `HS Active ${scenarioKey}` }, select: { id: true, name: true } })
      ]);

      await tx.companyHealthSystemLink.createMany({
        data: [
          { companyId: company.id, healthSystemId: hsSigned.id, relationshipType: "CUSTOMER" },
          { companyId: company.id, healthSystemId: hsPassed.id, relationshipType: "CUSTOMER" },
          { companyId: company.id, healthSystemId: hsRevisit.id, relationshipType: "CUSTOMER" },
          { companyId: company.id, healthSystemId: hsActive.id, relationshipType: "CUSTOMER" }
        ]
      });

      await tx.companyLoi.create({
        data: {
          companyId: company.id,
          healthSystemId: hsSigned.id,
          status: "SIGNED"
        }
      });

      await tx.companyOpportunity.createMany({
        data: [
          {
            companyId: company.id,
            healthSystemId: hsPassed.id,
            type: "SCREENING_LOI",
            title: `Passed ${scenarioKey}`,
            stage: "CLOSED_LOST"
          },
          {
            companyId: company.id,
            healthSystemId: hsRevisit.id,
            type: "SCREENING_LOI",
            title: `Revisit ${scenarioKey}`,
            stage: "ON_HOLD"
          },
          {
            companyId: company.id,
            healthSystemId: hsActive.id,
            type: "SCREENING_LOI",
            title: `Active ${scenarioKey}`,
            stage: "QUALIFICATION"
          }
        ]
      });

      await tx.$executeRawUnsafe(`
        UPDATE "CompanyHealthSystemLink" AS link
        SET "currentState" = CASE loi.status
          WHEN 'SIGNED' THEN 'LOI_SIGNED'::"CompanyHealthSystemCurrentState"
          WHEN 'DECLINED' THEN 'PASSED'::"CompanyHealthSystemCurrentState"
          WHEN 'NEGOTIATING' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          WHEN 'PENDING' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          ELSE NULL
        END
        FROM "CompanyLoi" AS loi
        WHERE loi."companyId" = link."companyId"
          AND loi."healthSystemId" = link."healthSystemId"
          AND link."currentState" IS NULL
          AND link."companyId" = $1
      `, company.id);

      await tx.$executeRawUnsafe(`
        WITH ranked_opportunities AS (
          SELECT DISTINCT ON (opp."companyId", opp."healthSystemId")
            opp."companyId",
            opp."healthSystemId",
            opp.stage
          FROM "CompanyOpportunity" AS opp
          WHERE opp.type = 'SCREENING_LOI'
            AND opp."healthSystemId" IS NOT NULL
            AND opp."companyId" = $1
          ORDER BY
            opp."companyId",
            opp."healthSystemId",
            CASE WHEN opp.stage IN ('CLOSED_WON', 'CLOSED_LOST') THEN 1 ELSE 0 END,
            opp."updatedAt" DESC,
            opp."createdAt" DESC
        )
        UPDATE "CompanyHealthSystemLink" AS link
        SET "currentState" = CASE ranked.stage
          WHEN 'CLOSED_WON' THEN 'LOI_SIGNED'::"CompanyHealthSystemCurrentState"
          WHEN 'CLOSED_LOST' THEN 'PASSED'::"CompanyHealthSystemCurrentState"
          WHEN 'ON_HOLD' THEN 'REVISIT'::"CompanyHealthSystemCurrentState"
          WHEN 'IDENTIFIED' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          WHEN 'QUALIFICATION' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          WHEN 'PROPOSAL' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          WHEN 'NEGOTIATION' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          WHEN 'LEGAL' THEN 'ACTIVE_SCREENING'::"CompanyHealthSystemCurrentState"
          ELSE link."currentState"
        END
        FROM ranked_opportunities AS ranked
        WHERE ranked."companyId" = link."companyId"
          AND ranked."healthSystemId" = link."healthSystemId"
          AND link."currentState" IS NULL
          AND link."companyId" = $1
      `, company.id);

      const links = await tx.companyHealthSystemLink.findMany({
        where: { companyId: company.id },
        include: { healthSystem: { select: { name: true } } },
        orderBy: { healthSystem: { name: "asc" } }
      });

      const byName = Object.fromEntries(links.map((link) => [link.healthSystem.name, link.currentState]));

      assert(byName[hsSigned.name] === "LOI_SIGNED", `Expected ${hsSigned.name} to backfill to LOI_SIGNED, got ${byName[hsSigned.name]}`);
      assert(byName[hsPassed.name] === "PASSED", `Expected ${hsPassed.name} to backfill to PASSED, got ${byName[hsPassed.name]}`);
      assert(byName[hsRevisit.name] === "REVISIT", `Expected ${hsRevisit.name} to backfill to REVISIT, got ${byName[hsRevisit.name]}`);
      assert(byName[hsActive.name] === "ACTIVE_SCREENING", `Expected ${hsActive.name} to backfill to ACTIVE_SCREENING, got ${byName[hsActive.name]}`);
      assert(links.every((link) => link.preliminaryInterest === null), "Expected preliminaryInterest to remain null for all verification rows.");

      console.log(JSON.stringify({
        scenarioKey,
        verified: links.map((link) => ({
          healthSystem: link.healthSystem.name,
          currentState: link.currentState,
          preliminaryInterest: link.preliminaryInterest
        }))
      }, null, 2));

      throw new Error("ROLLBACK_VERIFICATION_ONLY");
    }, {
      timeout: 20000,
      maxWait: 10000
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLLBACK_VERIFICATION_ONLY") {
      console.log("Verification passed. Transaction rolled back intentionally.");
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
