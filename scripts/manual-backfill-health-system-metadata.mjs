#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MANUAL_UPDATES = [
  {
    name: "AdventHealth",
    website: "https://www.adventhealth.com",
    headquartersCity: "Altamonte Springs",
    headquartersState: "Florida",
    headquartersCountry: "United States"
  },
  {
    name: "Banner Health",
    website: "https://www.bannerhealth.com",
    headquartersCity: "Phoenix",
    headquartersState: "Arizona",
    headquartersCountry: "United States"
  },
  {
    name: "BayCare Health System",
    website: "https://baycare.org",
    headquartersCity: "Clearwater",
    headquartersState: "Florida",
    headquartersCountry: "United States"
  },
  {
    name: "Cedars-Sinai Health",
    website: "https://www.cedars-sinai.org",
    headquartersCity: "Los Angeles",
    headquartersState: "California",
    headquartersCountry: "United States"
  },
  {
    name: "Children’s Hospital of Philadelphia",
    website: "https://www.chop.edu",
    headquartersCity: "Philadelphia",
    headquartersState: "Pennsylvania",
    headquartersCountry: "United States"
  },
  {
    name: "Childrens Mercy Kansas City",
    website: "https://www.childrensmercy.org",
    headquartersCity: "Kansas City",
    headquartersState: "Missouri",
    headquartersCountry: "United States"
  },
  {
    name: "Childrens Minnesota",
    website: "https://www.childrensmn.org",
    headquartersCity: "Minneapolis",
    headquartersState: "Minnesota",
    headquartersCountry: "United States"
  },
  {
    name: "Confluence Health",
    website: "https://www.confluencehealth.org",
    headquartersCity: "Wenatchee",
    headquartersState: "Washington",
    headquartersCountry: "United States"
  },
  {
    name: "FirstHealth of the Carolinas",
    website: "https://www.firsthealth.org",
    headquartersCity: "Pinehurst",
    headquartersState: "North Carolina",
    headquartersCountry: "United States"
  },
  {
    name: "Johns Hopkins Medicine",
    website: "https://www.hopkinsmedicine.org",
    headquartersCity: "Baltimore",
    headquartersState: "Maryland",
    headquartersCountry: "United States"
  },
  {
    name: "Loyola Medicine",
    website: "https://www.loyolamedicine.org",
    headquartersCity: "Maywood",
    headquartersState: "Illinois",
    headquartersCountry: "United States"
  },
  {
    name: "Memorial Hermann Health System",
    website: "https://memorialhermann.org",
    headquartersCity: "Houston",
    headquartersState: "Texas",
    headquartersCountry: "United States"
  },
  {
    name: "Midwest Cardiovascular Institute",
    website: "https://midwestcardio.com",
    headquartersCity: "Naperville",
    headquartersState: "Illinois",
    headquartersCountry: "United States"
  },
  {
    name: "Monument Health",
    website: "https://monument.health",
    headquartersCity: "Rapid City",
    headquartersState: "South Dakota",
    headquartersCountry: "United States"
  },
  {
    name: "Saint Francis Healthcare System",
    website: "https://www.sfmc.net",
    headquartersCity: "Cape Girardeau",
    headquartersState: "Missouri",
    headquartersCountry: "United States"
  },
  {
    name: "Stanford Healthcare",
    website: "https://stanfordhealthcare.org",
    headquartersCity: "Stanford",
    headquartersState: "California",
    headquartersCountry: "United States"
  },
  {
    name: "UCHealth",
    website: "https://www.uchealth.org",
    headquartersCity: "Aurora",
    headquartersState: "Colorado",
    headquartersCountry: "United States"
  },
  {
    name: "Virginia Mason Franciscan Health",
    website: "https://www.vmfh.org",
    headquartersCity: "Tacoma",
    headquartersState: "Washington",
    headquartersCountry: "United States"
  },
  {
    name: "WMCHealth",
    website: "https://www.wmchealth.org",
    headquartersCity: "Valhalla",
    headquartersState: "New York",
    headquartersCountry: "United States"
  },
  {
    name: "Yale New Haven Health System",
    website: "https://www.ynhhs.org",
    headquartersCity: "New Haven",
    headquartersState: "Connecticut",
    headquartersCountry: "United States"
  }
];

async function main() {
  const existing = await prisma.healthSystem.findMany({
    where: {
      name: {
        in: MANUAL_UPDATES.map((entry) => entry.name)
      }
    },
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true
    }
  });

  const byName = new Map(existing.map((entry) => [entry.name, entry]));
  const missing = MANUAL_UPDATES.map((entry) => entry.name).filter((name) => !byName.has(name));

  if (missing.length > 0) {
    throw new Error(`Missing health systems: ${missing.join(", ")}`);
  }

  const updated = [];

  for (const update of MANUAL_UPDATES) {
    const current = byName.get(update.name);
    await prisma.healthSystem.update({
      where: { id: current.id },
      data: {
        website: update.website,
        headquartersCity: update.headquartersCity,
        headquartersState: update.headquartersState,
        headquartersCountry: update.headquartersCountry,
        researchError: null,
        researchUpdatedAt: new Date()
      }
    });

    updated.push({
      name: update.name,
      previousWebsite: current.website,
      nextWebsite: update.website,
      previousHeadquartersCity: current.headquartersCity,
      nextHeadquartersCity: update.headquartersCity,
      previousHeadquartersState: current.headquartersState,
      nextHeadquartersState: update.headquartersState,
      previousHeadquartersCountry: current.headquartersCountry,
      nextHeadquartersCountry: update.headquartersCountry
    });
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          targeted: MANUAL_UPDATES.length,
          updated: updated.length
        },
        updated
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
