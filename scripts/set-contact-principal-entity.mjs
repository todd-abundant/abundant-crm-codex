#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const SHOW_HELP = process.argv.includes("--help");

const prisma = new PrismaClient();

function firstFromSet(values) {
  for (const value of values) {
    return value;
  }
  return null;
}

function getSingleAssociationByType(healthSystems, companies, coInvestors) {
  const hasOnlyHealthSystem = healthSystems.size === 1 && companies.size === 0 && coInvestors.size === 0;
  const hasOnlyCompany = companies.size === 1 && healthSystems.size === 0 && coInvestors.size === 0;
  const hasOnlyCoInvestor = coInvestors.size === 1 && healthSystems.size === 0 && companies.size === 0;

  if (hasOnlyHealthSystem) {
    return { type: "HEALTH_SYSTEM", id: firstFromSet(healthSystems) };
  }
  if (hasOnlyCompany) {
    return { type: "COMPANY", id: firstFromSet(companies) };
  }
  if (hasOnlyCoInvestor) {
    return { type: "CO_INVESTOR", id: firstFromSet(coInvestors) };
  }
  return null;
}

function printHelp() {
  console.log(`
Usage: node scripts/set-contact-principal-entity.mjs [options]

  --dry-run   Show what would be updated without writing
  --force     Overwrite existing principalEntityType/Id
  --help      Show this help text
`);
}

async function run() {
  if (SHOW_HELP) {
    printHelp();
    return;
  }

  const filter = FORCE
    ? {}
    : {
        OR: [{ principalEntityType: null }, { principalEntityId: null }],
      };

  const contacts = await prisma.contact.findMany({
    where: filter,
    select: {
      id: true,
      name: true,
      principalEntityType: true,
      principalEntityId: true,
      healthSystemLinks: { select: { healthSystemId: true } },
      companyLinks: { select: { companyId: true } },
      coInvestorLinks: { select: { coInvestorId: true } },
    },
  });

  const updates = [];

  for (const contact of contacts) {
    const healthSystemIds = new Set(
      contact.healthSystemLinks.map((link) => link.healthSystemId),
    );
    const companyIds = new Set(contact.companyLinks.map((link) => link.companyId));
    const coInvestorIds = new Set(
      contact.coInvestorLinks.map((link) => link.coInvestorId),
    );
    const association = getSingleAssociationByType(
      healthSystemIds,
      companyIds,
      coInvestorIds,
    );

    if (!association) {
      continue;
    }

    if (!FORCE && contact.principalEntityType && contact.principalEntityId) {
      continue;
    }

    updates.push({
      contactId: contact.id,
      contactName: contact.name,
      principalEntityType: association.type,
      principalEntityId: association.id,
    });
  }

  console.log(`Contacts evaluated: ${contacts.length}`);
  console.log(`Contacts eligible for update: ${updates.length}`);

  if (DRY_RUN) {
    if (updates.length === 0) {
      console.log("No updates to apply.");
      return;
    }
    for (const entry of updates) {
      console.log(
        `DRY RUN: ${entry.contactName} (${entry.contactId}) -> ${entry.principalEntityType}:${entry.principalEntityId}`,
      );
    }
    console.log("Dry run complete. Re-run without --dry-run to apply updates.");
    return;
  }

  if (updates.length === 0) {
    console.log("No updates to apply.");
    return;
  }

  for (const entry of updates) {
    await prisma.contact.update({
      where: { id: entry.contactId },
      data: {
        principalEntityType: entry.principalEntityType,
        principalEntityId: entry.principalEntityId,
      },
    });
  }

  console.log(`Updated principal entity for ${updates.length} contacts.`);
}

run()
  .catch(async (error) => {
    console.error("Failed to update contact principal entities:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
