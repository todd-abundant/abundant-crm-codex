#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CSV_PATH =
  process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ||
  path.join(process.env.HOME || "", "Downloads", "Contacts for health system prospect outreach - Master.csv");
const CREATED_WITHIN_HOURS_FLAG_INDEX = process.argv.findIndex((arg) => arg === "--created-within-hours");
const createdWithinHours =
  CREATED_WITHIN_HOURS_FLAG_INDEX >= 0 && process.argv[CREATED_WITHIN_HOURS_FLAG_INDEX + 1]
    ? Number(process.argv[CREATED_WITHIN_HOURS_FLAG_INDEX + 1])
    : 6;

const ADDITIONAL_EXISTING_ALIASES = new Map(
  Object.entries({
    "IU Health": "Indiana University Health, Inc.",
    "BJC HealthCare": "BJC Health System",
    "OSF HealthCare": "OSF Healthcare System",
    "Endeavor Health (NSEE)": "Endeavor Health",
    MemorialCare: "MemorialCare Health System",
    "Ochsner Health": "Ochsner Health System",
    "Novant Health": "Novant Health, Inc.",
    "MedStar Health": "MedStar Health, Inc.",
    "LifeBridge Health": "LifeBridge Health, Inc.",
    "Intermountain Health": "Intermountain Health Care, Inc.",
    "Christiana Care": "Christiana Care Health Services, Inc.",
    ChristianaCare: "Christiana Care Health Services, Inc.",
    "MUSC Health": "MUSC Health (Medical Univ. of SC)",
    "Sutter Health": "Sutter Health",
    "Texas Health": "Texas Health Resources",
    "UChicago Medicine": "The University of Chicago Medical Center",
    "University Hospitals": "University Hospitals Health System, Inc."
  }).map(([from, to]) => [normalizeName(from), normalizeName(to)])
);

if (!Number.isFinite(createdWithinHours) || createdWithinHours <= 0) {
  throw new Error("Expected --created-within-hours to be a positive number.");
}

function cleanCell(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === "\"") {
        if (csvText[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeName(value) {
  return cleanCell(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function printJson(label, value) {
  console.log(`${label}=${JSON.stringify(value)}`);
}

function readOrganizationNames(filePath) {
  const csvText = readFileSync(filePath, "utf8");
  const [headerRow = [], ...dataRows] = parseCsv(csvText);
  const headers = headerRow.map((value) => cleanCell(value));
  const companyIndex = headers.indexOf("Company");

  if (companyIndex === -1) {
    throw new Error("CSV is missing expected Company column.");
  }

  return [...new Set(dataRows.map((row) => cleanCell(row[companyIndex])).filter(Boolean))];
}

async function main() {
  const organizationNames = readOrganizationNames(CSV_PATH);
  const since = new Date(Date.now() - createdWithinHours * 60 * 60 * 1000);
  const healthSystems = await prisma.healthSystem.findMany({
    select: {
      id: true,
      name: true,
      legalName: true,
      createdAt: true,
      researchStatus: true,
      researchJobs: {
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  const byNormalizedName = new Map();
  for (const healthSystem of healthSystems) {
    const names = [...new Set([healthSystem.name, healthSystem.legalName].map((value) => normalizeName(value)).filter(Boolean))];
    for (const name of names) {
      const existing = byNormalizedName.get(name);
      if (existing) {
        existing.push(healthSystem);
      } else {
        byNormalizedName.set(name, [healthSystem]);
      }
    }
  }

  const queued = [];
  const skippedExistingJobs = [];
  const skippedOlder = [];
  const unmatched = [];
  const ambiguous = [];

  for (const organization of organizationNames) {
    const normalizedOrganization = normalizeName(organization);
    const matches =
      byNormalizedName.get(normalizedOrganization) ||
      byNormalizedName.get(ADDITIONAL_EXISTING_ALIASES.get(normalizedOrganization) || "") ||
      [];
    if (matches.length === 0) {
      unmatched.push({ organization });
      continue;
    }

    if (matches.length > 1) {
      ambiguous.push({
        organization,
        candidateIds: matches.map((entry) => entry.id)
      });
      continue;
    }

    const healthSystem = matches[0];
    const hasResearchJobs = healthSystem.researchJobs.length > 0;

    if (healthSystem.createdAt < since) {
      skippedOlder.push({
        organization,
        healthSystemId: healthSystem.id,
        healthSystemName: healthSystem.name,
        createdAt: healthSystem.createdAt
      });
      continue;
    }

    if (hasResearchJobs || healthSystem.researchStatus !== "DRAFT") {
      skippedExistingJobs.push({
        organization,
        healthSystemId: healthSystem.id,
        healthSystemName: healthSystem.name,
        researchStatus: healthSystem.researchStatus,
        latestJobStatus: healthSystem.researchJobs[0]?.status || null
      });
      continue;
    }

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
          selectedWebsite: null
        }
      });
    });

    queued.push({
      organization,
      healthSystemId: healthSystem.id,
      healthSystemName: healthSystem.name
    });
  }

  printJson("summary", {
    csvPath: CSV_PATH,
    createdWithinHours,
    organizationsInCsv: organizationNames.length,
    queued: queued.length,
    skippedExistingJobs: skippedExistingJobs.length,
    skippedOlder: skippedOlder.length,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length
  });
  printJson("queued_health_systems", queued);
  printJson("skipped_existing_jobs", skippedExistingJobs);
  printJson("skipped_older_health_systems", skippedOlder);
  printJson("unmatched_organizations", unmatched);
  printJson("ambiguous_organizations", ambiguous);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
