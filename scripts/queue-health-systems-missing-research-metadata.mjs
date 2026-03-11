#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function trimOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function main() {
  const targetSystems = await prisma.healthSystem.findMany({
    where: {
      researchStatus: "DRAFT",
      headquartersCity: null,
      headquartersState: null,
      headquartersCountry: null,
      researchJobs: {
        none: {
          status: {
            in: ["QUEUED", "RUNNING"]
          }
        }
      }
    },
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true,
      researchStatus: true
    },
    orderBy: { name: "asc" }
  });

  const queued = [];

  for (const healthSystem of targetSystems) {
    await prisma.$transaction(async (tx) => {
      await tx.healthSystem.update({
        where: { id: healthSystem.id },
        data: {
          researchStatus: "QUEUED",
          researchError: null,
          researchUpdatedAt: new Date()
        }
      });

      await tx.healthSystemResearchJob.create({
        data: {
          healthSystemId: healthSystem.id,
          status: "QUEUED",
          searchName: healthSystem.name,
          selectedCity: trimOrNull(healthSystem.headquartersCity),
          selectedState: trimOrNull(healthSystem.headquartersState),
          selectedCountry: trimOrNull(healthSystem.headquartersCountry),
          selectedWebsite: trimOrNull(healthSystem.website)
        }
      });
    });

    queued.push({
      id: healthSystem.id,
      name: healthSystem.name,
      website: trimOrNull(healthSystem.website),
      researchStatusBeforeQueue: healthSystem.researchStatus
    });
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          queued: queued.length
        },
        queuedHealthSystems: queued
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
