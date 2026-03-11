#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  let limit = 50;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") {
      const raw = argv[i + 1];
      if (!raw) {
        throw new Error("Missing value for --limit");
      }
      limit = Number.parseInt(raw, 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`Invalid --limit value: ${raw}`);
      }
      i += 1;
    }
  }

  return { limit };
}

function trimOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));

  const healthSystems = await prisma.healthSystem.findMany({
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true,
      researchStatus: true,
      researchUpdatedAt: true
    },
    orderBy: { name: "asc" }
  });

  const normalized = healthSystems.map((system) => {
    const headquartersCity = trimOrNull(system.headquartersCity);
    const headquartersState = trimOrNull(system.headquartersState);
    const headquartersCountry = trimOrNull(system.headquartersCountry);
    const website = trimOrNull(system.website);
    const missingCity = !headquartersCity;
    const missingState = !headquartersState;
    const missingCountry = !headquartersCountry;
    const missingAnyHq = missingCity || missingState || missingCountry;
    const missingAllHq = missingCity && missingState && missingCountry;
    const missingWebsite = !website;
    const activeResearch = system.researchStatus === "QUEUED" || system.researchStatus === "RUNNING";

    return {
      ...system,
      website,
      headquartersCity,
      headquartersState,
      headquartersCountry,
      missingAnyHq,
      missingAllHq,
      missingWebsite,
      activeResearch,
      queueableForResearch: (missingAnyHq || missingWebsite) && !activeResearch
    };
  });

  const missingAnyHq = normalized.filter((system) => system.missingAnyHq);
  const missingAllHq = normalized.filter((system) => system.missingAllHq);
  const missingWebsite = normalized.filter((system) => system.missingWebsite);
  const missingAnyHqOrWebsite = normalized.filter(
    (system) => system.missingAnyHq || system.missingWebsite
  );
  const queueable = normalized.filter((system) => system.queueableForResearch);
  const queueableMissingAnyHq = queueable.filter((system) => system.missingAnyHq);
  const queueableMissingAllHq = queueable.filter((system) => system.missingAllHq);
  const queueableMissingWebsiteOnly = queueable.filter(
    (system) => !system.missingAnyHq && system.missingWebsite
  );

  const summary = {
    totalHealthSystems: normalized.length,
    missingAnyHq: missingAnyHq.length,
    missingAllHq: missingAllHq.length,
    missingWebsite: missingWebsite.length,
    missingAnyHqOrWebsite: missingAnyHqOrWebsite.length,
    queueableForResearch: queueable.length,
    queueableMissingAnyHq: queueableMissingAnyHq.length,
    queueableMissingAllHq: queueableMissingAllHq.length,
    queueableMissingWebsiteOnly: queueableMissingWebsiteOnly.length,
    missingAnyHqByResearchStatus: countBy(missingAnyHq, (system) => system.researchStatus),
    queueableByResearchStatus: countBy(queueable, (system) => system.researchStatus)
  };

  const queueableSample = queueable.slice(0, limit).map((system) => ({
    id: system.id,
    name: system.name,
    researchStatus: system.researchStatus,
    website: system.website,
    headquartersCity: system.headquartersCity,
    headquartersState: system.headquartersState,
    headquartersCountry: system.headquartersCountry,
    missingAnyHq: system.missingAnyHq,
    missingAllHq: system.missingAllHq,
    missingWebsite: system.missingWebsite,
    researchUpdatedAt: system.researchUpdatedAt ? system.researchUpdatedAt.toISOString() : null
  }));

  console.log(
    JSON.stringify(
      {
        summary,
        queueableSample
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
