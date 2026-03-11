#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [jobCounts, healthSystemCounts] = await Promise.all([
    prisma.healthSystemResearchJob.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.healthSystem.groupBy({
      by: ["researchStatus"],
      _count: { _all: true }
    })
  ]);

  console.log(
    JSON.stringify(
      {
        jobCounts: Object.fromEntries(jobCounts.map((row) => [row.status, row._count._all])),
        healthSystemResearchStatusCounts: Object.fromEntries(
          healthSystemCounts.map((row) => [row.researchStatus, row._count._all])
        )
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
