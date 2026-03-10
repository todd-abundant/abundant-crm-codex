#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const typeSuffixByOpportunityType = {
  SCREENING_LOI: "LOI",
  VENTURE_STUDIO_SERVICES: "Venture Studio Services",
  S1_TERM_SHEET: "Term Sheet",
  COMMERCIAL_CONTRACT: "Commercial Contract",
  PROSPECT_PURSUIT: "Prospect Pursuit"
};

function opportunityTypeTitleSuffix(type) {
  return typeSuffixByOpportunityType[type] || "Opportunity";
}

function generateOldTitle({ companyName, healthSystemName, type }) {
  const trimmedCompanyName = companyName.trim();
  const trimmedHealthSystemName = (healthSystemName || "").trim();
  const suffix = opportunityTypeTitleSuffix(type);
  if (!trimmedHealthSystemName) {
    return `${trimmedCompanyName} - ${suffix}`;
  }
  return `${trimmedCompanyName} - ${trimmedHealthSystemName} ${suffix}`;
}

function generateNewTitle({ companyName, healthSystemName, type }) {
  const trimmedCompanyName = companyName.trim();
  const trimmedHealthSystemName = (healthSystemName || "").trim();
  const suffix = opportunityTypeTitleSuffix(type);
  if (!trimmedHealthSystemName) {
    return `${trimmedCompanyName} - ${suffix}`;
  }
  return `${trimmedHealthSystemName} - ${trimmedCompanyName} ${suffix}`;
}

function parseBooleanArg(name) {
  return process.argv.includes(name);
}

const DRY_RUN = parseBooleanArg("--dry-run");

async function main() {
  const opportunities = await prisma.companyOpportunity.findMany({
    where: { healthSystemId: { not: null } },
    select: {
      id: true,
      title: true,
      type: true,
      company: { select: { name: true } },
      healthSystem: { select: { name: true } }
    }
  });

  let updated = 0;
  let skipped = 0;
  const updates = [];

  for (const opportunity of opportunities) {
    const companyName = opportunity.company.name || "";
    const healthSystemName = opportunity.healthSystem?.name || null;

    if (!companyName || !healthSystemName) {
      skipped += 1;
      continue;
    }

    const oldTitle = generateOldTitle({
      companyName,
      healthSystemName,
      type: opportunity.type
    });

    if (opportunity.title !== oldTitle) {
      skipped += 1;
      continue;
    }

    const newTitle = generateNewTitle({
      companyName,
      healthSystemName,
      type: opportunity.type
    });

    if (newTitle === opportunity.title) {
      skipped += 1;
      continue;
    }

    updates.push({
      id: opportunity.id,
      title: newTitle
    });
  }

  console.log(`Found ${opportunities.length} opportunities to evaluate.`);
  console.log(`Matched ${updates.length} old auto-generated titles.`);

  if (DRY_RUN) {
    for (const entry of updates) {
      console.log(`Would update opportunity ${entry.id} -> ${entry.title}`);
    }
    console.log(`Dry run complete. ${updates.length} opportunities would be updated.`);
    return;
  }

  for (const entry of updates) {
    await prisma.companyOpportunity.update({
      where: { id: entry.id },
      data: { title: entry.title }
    });
    updated += 1;
  }

  console.log(`Updated ${updated} opportunities.`);
  if (updated === 0) {
    console.log("No opportunities required changes.");
  }
  if (skipped > 0) {
    console.log(`Skipped ${skipped} opportunities that are already custom or not in old format.`);
  }
}

main()
  .catch(async (error) => {
    console.error("Failed to update opportunity titles:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
