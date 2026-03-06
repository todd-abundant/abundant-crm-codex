import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HEALTH_SYSTEMS_CSV_PATH =
  process.env.HEALTH_SYSTEMS_CSV_PATH ||
  path.join(process.cwd(), "Seed Data", "Health Systems.csv");
const CONTACTS_CSV_PATH =
  process.env.CONTACTS_CSV_PATH || path.join(process.cwd(), "Seed Data", "contacts.csv");

const STRICT_CONTACT_MATCH = process.argv.includes("--strict-contacts");
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_CREATE_MISSING_HEALTH_SYSTEMS = !process.argv.includes(
  "--no-auto-create-health-systems",
);

function cleanCell(value) {
  return (value || "").replace(/^\uFEFF/, "").trim();
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
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameLoose(value) {
  return normalizeName(value)
    .replace(
      /\b(the|of|and|inc|incorporated|corp|corporation|company|llc|ltd|health|healthcare|care|system|services|service|network|foundation|medical|hospital|center|centre|plan)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWebsite(websiteRaw) {
  const website = cleanCell(websiteRaw);
  if (!website) {
    return null;
  }

  const withoutProtocol = website.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
  if (!withoutProtocol) {
    return null;
  }

  return `https://${withoutProtocol}`;
}

function normalizeDomain(domainRaw) {
  const domain = cleanCell(domainRaw).toLowerCase();
  if (!domain) {
    return null;
  }

  return domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
}

function extractEmailDomain(emailRaw) {
  const email = cleanCell(emailRaw).toLowerCase();
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }

  return normalizeDomain(email.slice(atIndex + 1));
}

function parseRevenueUsd(revenueRaw) {
  const revenueText = cleanCell(revenueRaw).toUpperCase().replace(/,/g, "");
  if (!revenueText) {
    return null;
  }

  const match = revenueText.match(/(\d+(?:\.\d+)?)\s*([BMK]?)/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  if (Number.isNaN(numeric)) {
    return null;
  }

  const suffix = match[2] || "";
  const multiplier = suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return (numeric * multiplier).toFixed(2);
}

function parseHeadquarters(addressRaw) {
  const address = cleanCell(addressRaw);
  if (!address) {
    return { headquartersCity: null, headquartersState: null, headquartersCountry: null };
  }

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const headquartersCity = parts.length >= 2 ? parts[parts.length - 2] : null;
  const stateAndZip = parts[parts.length - 1] || "";
  const stateMatch = stateAndZip.match(/^([a-zA-Z]{2})\b/);
  const headquartersState = stateMatch ? stateMatch[1].toUpperCase() : null;

  return {
    headquartersCity: headquartersCity || null,
    headquartersState,
    headquartersCountry: "USA",
  };
}

const ACCOUNT_NAME_ALIASES = new Map(
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
    "MUSC Health": "MUSC Health (Medical Univ. of SC)",
  }).map(([from, to]) => [normalizeName(from), normalizeName(to)]),
);

function addToSetMap(map, key, value) {
  if (!key) {
    return;
  }

  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

function takeSingle(set) {
  if (!set || set.size !== 1) {
    return null;
  }

  for (const value of set) {
    return value;
  }

  return null;
}

function loadHealthSystems(csvPath) {
  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  const systemsByKey = new Map();

  let section = "unknown";

  for (const row of rows) {
    const firstCell = cleanCell(row[0]);
    if (!firstCell) {
      continue;
    }

    if (/^formal corporate name$/i.test(firstCell)) {
      section = "alliance";
      continue;
    }

    if (/^formal name$/i.test(firstCell)) {
      section = "market";
      continue;
    }

    const key = normalizeName(firstCell);
    if (!key) {
      continue;
    }

    const parsedHeadquarters = parseHeadquarters(row[1]);
    const candidate = {
      name: firstCell,
      legalName: firstCell,
      website: normalizeWebsite(row[3]),
      logoUrl: normalizeWebsite(row[4]),
      headquartersCity: parsedHeadquarters.headquartersCity,
      headquartersState: parsedHeadquarters.headquartersState,
      headquartersCountry: parsedHeadquarters.headquartersCountry,
      netPatientRevenueUsd: parseRevenueUsd(row[2]),
      isAllianceMember: section === "alliance",
    };

    const existing = systemsByKey.get(key);
    if (!existing) {
      systemsByKey.set(key, candidate);
      continue;
    }

    existing.isAllianceMember = existing.isAllianceMember || candidate.isAllianceMember;
    existing.website = existing.website || candidate.website;
    existing.logoUrl = existing.logoUrl || candidate.logoUrl;
    existing.headquartersCity = existing.headquartersCity || candidate.headquartersCity;
    existing.headquartersState = existing.headquartersState || candidate.headquartersState;
    existing.headquartersCountry = existing.headquartersCountry || candidate.headquartersCountry;
    existing.netPatientRevenueUsd = existing.netPatientRevenueUsd || candidate.netPatientRevenueUsd;
  }

  return Array.from(systemsByKey.values());
}

function loadContacts(csvPath) {
  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  const contacts = [];
  const dedupe = new Set();

  for (const row of rows) {
    const salutation = cleanCell(row[0]);
    const firstName = cleanCell(row[1]);
    const lastName = cleanCell(row[2]);

    if (/^salutation$/i.test(salutation) && /^first name$/i.test(firstName)) {
      continue;
    }

    const title = cleanCell(row[3]) || null;
    const accountName = cleanCell(row[4]);
    const email = cleanCell(row[5]).toLowerCase() || null;
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (!name) {
      continue;
    }

    const dedupeKey = `${name.toLowerCase()}|${email || ""}|${normalizeName(accountName)}`;
    if (dedupe.has(dedupeKey)) {
      continue;
    }

    dedupe.add(dedupeKey);
    contacts.push({
      name,
      title,
      email,
      accountName,
    });
  }

  return contacts;
}

function buildHealthSystemLookup(healthSystems) {
  const exactMap = new Map();
  const looseMap = new Map();
  const domainMap = new Map();

  for (const healthSystem of healthSystems) {
    for (const value of [healthSystem.name, healthSystem.legalName]) {
      const exact = normalizeName(value);
      if (exact) {
        exactMap.set(exact, healthSystem.id);
      }

      const loose = normalizeNameLoose(value);
      addToSetMap(looseMap, loose, healthSystem.id);
    }

    const domain = normalizeDomain(healthSystem.website);
    addToSetMap(domainMap, domain, healthSystem.id);
  }

  return { exactMap, looseMap, domainMap };
}

function matchHealthSystemId(contact, lookup) {
  const accountKey = normalizeName(contact.accountName);
  const aliasTarget = ACCOUNT_NAME_ALIASES.get(accountKey);

  const exactCandidates = [];
  if (aliasTarget) {
    exactCandidates.push(aliasTarget);
  }
  if (accountKey) {
    exactCandidates.push(accountKey);
  }

  for (const candidate of exactCandidates) {
    const exactMatch = lookup.exactMap.get(candidate);
    if (exactMatch) {
      return exactMatch;
    }
  }

  for (const candidate of exactCandidates) {
    const looseKey = normalizeNameLoose(candidate);
    const looseMatch = takeSingle(lookup.looseMap.get(looseKey));
    if (looseMatch) {
      return looseMatch;
    }
  }

  const emailDomain = extractEmailDomain(contact.email);
  if (!emailDomain) {
    return null;
  }

  const directDomainMatch = takeSingle(lookup.domainMap.get(emailDomain));
  if (directDomainMatch) {
    return directDomainMatch;
  }

  for (const [domain, ids] of lookup.domainMap) {
    if (ids.size !== 1) {
      continue;
    }

    if (emailDomain === domain || emailDomain.endsWith(`.${domain}`) || domain.endsWith(`.${emailDomain}`)) {
      return takeSingle(ids);
    }
  }

  return null;
}

async function main() {
  const healthSystems = loadHealthSystems(HEALTH_SYSTEMS_CSV_PATH);
  const contacts = loadContacts(CONTACTS_CSV_PATH);

  if (healthSystems.length === 0) {
    throw new Error(`No health systems parsed from CSV: ${HEALTH_SYSTEMS_CSV_PATH}`);
  }

  if (contacts.length === 0) {
    throw new Error(`No contacts parsed from CSV: ${CONTACTS_CSV_PATH}`);
  }

  console.log(`health_systems_to_import=${healthSystems.length}`);
  console.log(`contacts_to_import=${contacts.length}`);
  console.log(`strict_contact_match=${STRICT_CONTACT_MATCH}`);
  console.log(`dry_run=${DRY_RUN}`);
  console.log(`auto_create_missing_health_systems=${AUTO_CREATE_MISSING_HEALTH_SYSTEMS}`);

  if (DRY_RUN) {
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const deletedContacts = await tx.contact.deleteMany();
      const deletedHealthSystems = await tx.healthSystem.deleteMany();

      const createdHealthSystems = [];
      for (const healthSystem of healthSystems) {
        const created = await tx.healthSystem.create({ data: healthSystem });
        createdHealthSystems.push(created);
      }

      const lookup = buildHealthSystemLookup(createdHealthSystems);
      let createdContacts = 0;
      let createdLinks = 0;
      let autoCreatedHealthSystems = 0;
      const unmatchedContacts = [];
      const autoCreatedHealthSystemByAccount = new Map();

      for (const contact of contacts) {
        let healthSystemId = matchHealthSystemId(contact, lookup);

        if (!healthSystemId && AUTO_CREATE_MISSING_HEALTH_SYSTEMS) {
          const accountName = cleanCell(contact.accountName);
          const accountKey = normalizeName(accountName);

          if (accountKey) {
            const existingAutoCreatedId = autoCreatedHealthSystemByAccount.get(accountKey);
            if (existingAutoCreatedId) {
              healthSystemId = existingAutoCreatedId;
            } else {
              const emailDomain = extractEmailDomain(contact.email);
              const createdHealthSystem = await tx.healthSystem.create({
                data: {
                  name: accountName,
                  legalName: accountName,
                  website: emailDomain ? `https://${emailDomain}` : null,
                  isAllianceMember: false,
                },
              });

              healthSystemId = createdHealthSystem.id;
              autoCreatedHealthSystemByAccount.set(accountKey, createdHealthSystem.id);
              autoCreatedHealthSystems += 1;

              const exact = normalizeName(createdHealthSystem.name);
              if (exact) {
                lookup.exactMap.set(exact, createdHealthSystem.id);
              }

              const loose = normalizeNameLoose(createdHealthSystem.name);
              addToSetMap(lookup.looseMap, loose, createdHealthSystem.id);

              const domain = normalizeDomain(createdHealthSystem.website);
              addToSetMap(lookup.domainMap, domain, createdHealthSystem.id);
            }
          }
        }

        if (!healthSystemId) {
          unmatchedContacts.push(contact);
          continue;
        }

        const createdContact = await tx.contact.create({
          data: {
            name: contact.name,
            title: contact.title,
            email: contact.email,
          },
        });

        await tx.contactHealthSystem.create({
          data: {
            contactId: createdContact.id,
            healthSystemId,
            roleType: "EXECUTIVE",
            title: contact.title,
          },
        });

        createdContacts += 1;
        createdLinks += 1;
      }

      if (STRICT_CONTACT_MATCH && unmatchedContacts.length > 0) {
        const unmatchedAccounts = [...new Set(unmatchedContacts.map((contact) => contact.accountName))]
          .filter(Boolean)
          .sort();
        throw new Error(
          `Unmatched contacts: ${unmatchedContacts.length}. Accounts: ${unmatchedAccounts.join(", ")}`,
        );
      }

      return {
        deletedContacts: deletedContacts.count,
        deletedHealthSystems: deletedHealthSystems.count,
        createdHealthSystems: createdHealthSystems.length,
        autoCreatedHealthSystems,
        createdContacts,
        createdLinks,
        unmatchedContacts,
      };
    },
    { maxWait: 10_000, timeout: 180_000 },
  );

  console.log(`deleted_contacts=${result.deletedContacts}`);
  console.log(`deleted_health_systems=${result.deletedHealthSystems}`);
  console.log(`created_health_systems=${result.createdHealthSystems}`);
  console.log(`auto_created_health_systems=${result.autoCreatedHealthSystems}`);
  console.log(`created_contacts=${result.createdContacts}`);
  console.log(`created_contact_health_system_links=${result.createdLinks}`);
  console.log(`unmatched_contacts=${result.unmatchedContacts.length}`);

  if (result.unmatchedContacts.length > 0) {
    const unmatchedAccounts = [...new Set(result.unmatchedContacts.map((contact) => contact.accountName))]
      .filter(Boolean)
      .sort();

    console.log("unmatched_contact_accounts_start");
    for (const accountName of unmatchedAccounts) {
      console.log(accountName);
    }
    console.log("unmatched_contact_accounts_end");
  }
}

main()
  .catch((error) => {
    console.error("reseed_health_systems_contacts_error");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
