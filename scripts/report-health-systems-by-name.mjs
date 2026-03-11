#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const names = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--name") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --name");
      }
      names.push(value);
      i += 1;
      continue;
    }
    names.push(arg);
  }

  if (names.length === 0) {
    throw new Error("Provide at least one health system name.");
  }

  return { names };
}

async function main() {
  const { names } = parseArgs(process.argv.slice(2));

  const healthSystems = await prisma.healthSystem.findMany({
    where: {
      name: {
        in: names
      }
    },
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true,
      researchStatus: true,
      researchError: true,
      researchUpdatedAt: true,
      researchJobs: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          status: true,
          searchName: true,
          selectedWebsite: true,
          selectedCity: true,
          selectedState: true,
          selectedCountry: true,
          errorMessage: true,
          createdAt: true,
          startedAt: true,
          completedAt: true
        }
      }
    },
    orderBy: { name: "asc" }
  });

  console.log(
    JSON.stringify(
      {
        requestedNames: names,
        found: healthSystems.length,
        missing: names.filter((name) => !healthSystems.some((system) => system.name === name)),
        healthSystems: healthSystems.map((system) => ({
          ...system,
          researchUpdatedAt: system.researchUpdatedAt
            ? system.researchUpdatedAt.toISOString()
            : null,
          researchJobs: system.researchJobs.map((job) => ({
            ...job,
            createdAt: job.createdAt ? job.createdAt.toISOString() : null,
            startedAt: job.startedAt ? job.startedAt.toISOString() : null,
            completedAt: job.completedAt ? job.completedAt.toISOString() : null
          }))
        }))
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
