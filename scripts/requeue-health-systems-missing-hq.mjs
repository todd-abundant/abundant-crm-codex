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
      researchStatus: true
    },
    orderBy: { name: "asc" }
  });

  const queuedHealthSystems = [];

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
          selectedCity: null,
          selectedState: null,
          selectedCountry: null,
          selectedWebsite: trimOrNull(healthSystem.website)
        }
      });
    });

    queuedHealthSystems.push({
      id: healthSystem.id,
      name: healthSystem.name,
      researchStatusBeforeQueue: healthSystem.researchStatus,
      website: trimOrNull(healthSystem.website)
    });
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          queued: queuedHealthSystems.length
        },
        queuedHealthSystems
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
