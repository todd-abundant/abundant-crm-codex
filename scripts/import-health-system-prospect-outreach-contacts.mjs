#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CSV_PATH =
  process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ||
  path.join(process.env.HOME || "", "Downloads", "Contacts for health system prospect outreach - Master.csv");

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

function normalizeEmail(value) {
  return cleanCell(value).toLowerCase();
}

function normalizePhone(value) {
  return cleanCell(value).replace(/\D+/g, "");
}

function inferContactChannels(value) {
  const cleaned = cleanCell(value);
  if (!cleaned) return { email: null, phone: null };
  if (cleaned.includes("@")) return { email: cleaned.toLowerCase(), phone: null };
  return { email: null, phone: cleaned };
}

function printJson(label, value) {
  console.log(`${label}=${JSON.stringify(value)}`);
}

function indexOne(map, key, value) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
}

function uniq(values) {
  return [...new Set(values)];
}

function pickPreferredLink(links) {
  if (!links || links.length === 0) return null;
  return [...links].sort((a, b) => {
    const left = a.createdAt ? String(a.createdAt) : "";
    const right = b.createdAt ? String(b.createdAt) : "";
    return left.localeCompare(right) || a.id.localeCompare(b.id);
  })[0];
}

function readCsvRows(filePath) {
  const csvText = readFileSync(filePath, "utf8");
  const [headerRow = [], ...dataRows] = parseCsv(csvText);
  const headers = headerRow.map((value) => cleanCell(value));

  const companyIndex = headers.indexOf("Company");
  const nameIndex = headers.indexOf("Name");
  const titleIndex = headers.indexOf("Title");
  const contactInfoIndex = headers.indexOf("Email");

  if (companyIndex === -1 || nameIndex === -1 || titleIndex === -1 || contactInfoIndex === -1) {
    throw new Error("CSV is missing one or more expected columns: Company, Name, Title, Email");
  }

  return dataRows.map((columns, index) => {
    const contactChannels = inferContactChannels(columns[contactInfoIndex]);

    return {
      rowNumber: index + 2,
      organization: cleanCell(columns[companyIndex]),
      name: cleanCell(columns[nameIndex]),
      title: cleanCell(columns[titleIndex]) || null,
      email: contactChannels.email,
      phone: contactChannels.phone
    };
  });
}

function dedupeRows(rows) {
  const seen = new Set();
  const uniqueRows = [];
  let duplicateRowCount = 0;

  for (const row of rows) {
    const key = [
      normalizeName(row.organization),
      normalizeName(row.name),
      normalizeEmail(row.email),
      normalizePhone(row.phone)
    ].join("|");

    if (seen.has(key)) {
      duplicateRowCount += 1;
      continue;
    }

    seen.add(key);
    uniqueRows.push(row);
  }

  return { uniqueRows, duplicateRowCount };
}

function buildReportTemplate(csvRows, duplicateRowCount, uniqueRows) {
  return {
    mode: APPLY ? "apply" : "dry_run",
    csvPath: CSV_PATH,
    csvRows: csvRows.length,
    duplicateRowsSkipped: duplicateRowCount,
    uniqueRowsAnalyzed: uniqueRows.length,
    skippedBlankRows: 0,
    plannedHealthSystemCreates: 0,
    matchedExistingHealthSystems: 0,
    matchedExistingAllianceMemberRows: 0,
    matchedExistingLimitedPartnerRows: 0,
    plannedContactCreates: 0,
    matchedExistingContacts: 0,
    plannedContactFieldUpdates: 0,
    plannedHealthSystemLinkCreates: 0,
    plannedHealthSystemLinkUpdates: 0,
    noOpRows: 0,
    ambiguousHealthSystemRows: 0,
    ambiguousContactRows: 0
  };
}

function buildHealthSystemLookup(healthSystems) {
  const byNormalizedName = new Map();

  for (const entry of healthSystems) {
    indexOne(byNormalizedName, normalizeName(entry.name), entry.id);
    indexOne(byNormalizedName, normalizeName(entry.legalName), entry.id);
  }

  return { byNormalizedName };
}

function buildContactIndexes(contacts, links) {
  const byId = new Map();
  const byEmail = new Map();
  const byHealthSystemAndName = new Map();
  const linksByContactAndHealthSystem = new Map();

  for (const contact of contacts) {
    byId.set(contact.id, contact);
    indexOne(byEmail, normalizeEmail(contact.email), contact.id);

    if (
      contact.principalEntityType === "HEALTH_SYSTEM" &&
      contact.principalEntityId &&
      contact.name
    ) {
      indexOne(
        byHealthSystemAndName,
        `${contact.principalEntityId}|${normalizeName(contact.name)}`,
        contact.id
      );
    }
  }

  for (const link of links) {
    const key = `${link.contactId}|${link.healthSystemId}`;
    const existing = linksByContactAndHealthSystem.get(key);
    if (existing) {
      existing.push(link);
      continue;
    }
    linksByContactAndHealthSystem.set(key, [link]);
  }

  return { byId, byEmail, byHealthSystemAndName, linksByContactAndHealthSystem };
}

function updateContactIndexes(indexes, contact) {
  indexes.byId.set(contact.id, contact);
  indexOne(indexes.byEmail, normalizeEmail(contact.email), contact.id);

  if (
    contact.principalEntityType === "HEALTH_SYSTEM" &&
    contact.principalEntityId &&
    contact.name
  ) {
    indexOne(
      indexes.byHealthSystemAndName,
      `${contact.principalEntityId}|${normalizeName(contact.name)}`,
      contact.id
    );
  }
}

function addLinkToIndexes(indexes, link) {
  const key = `${link.contactId}|${link.healthSystemId}`;
  const existing = indexes.linksByContactAndHealthSystem.get(key);
  if (existing) {
    existing.push(link);
    return;
  }
  indexes.linksByContactAndHealthSystem.set(key, [link]);
}

function resolveHealthSystem(row, lookup, healthSystemsById, plannedHealthSystemsByOrganization) {
  const organizationKey = normalizeName(row.organization);
  if (!organizationKey) {
    return { status: "ambiguous", candidateIds: [] };
  }

  const plannedHealthSystem = plannedHealthSystemsByOrganization.get(row.organization);
  if (plannedHealthSystem) {
    return {
      status: "planned_create",
      healthSystemId: plannedHealthSystem.id,
      healthSystemName: plannedHealthSystem.name,
      existingHealthSystem: null
    };
  }

  const directCandidates = uniq(lookup.byNormalizedName.get(organizationKey) || []);
  if (directCandidates.length === 1) {
    const matchedHealthSystem = healthSystemsById.get(directCandidates[0]);
    return {
      status: "matched",
      healthSystemId: matchedHealthSystem.id,
      healthSystemName: matchedHealthSystem.name,
      existingHealthSystem: matchedHealthSystem
    };
  }

  if (directCandidates.length > 1) {
    return { status: "ambiguous", candidateIds: directCandidates };
  }

  const aliasTarget = ADDITIONAL_EXISTING_ALIASES.get(organizationKey);
  if (aliasTarget) {
    const aliasCandidates = uniq(lookup.byNormalizedName.get(aliasTarget) || []);
    if (aliasCandidates.length === 1) {
      const matchedHealthSystem = healthSystemsById.get(aliasCandidates[0]);
      return {
        status: "matched",
        healthSystemId: matchedHealthSystem.id,
        healthSystemName: matchedHealthSystem.name,
        existingHealthSystem: matchedHealthSystem
      };
    }

    if (aliasCandidates.length > 1) {
      return { status: "ambiguous", candidateIds: aliasCandidates };
    }
  }

  const plannedHealthSystemCreate = {
    id: `planned-health-system:${row.organization}`,
    organization: row.organization,
    name: row.organization,
    legalName: row.organization
  };
  plannedHealthSystemsByOrganization.set(row.organization, plannedHealthSystemCreate);

  return {
    status: "planned_create",
    healthSystemId: plannedHealthSystemCreate.id,
    healthSystemName: plannedHealthSystemCreate.name,
    existingHealthSystem: null
  };
}

function findContactMatch(row, healthSystemId, contactIndexes) {
  const emailMatches = uniq(contactIndexes.byEmail.get(normalizeEmail(row.email)) || []);
  if (emailMatches.length === 1) {
    return { status: "matched", contactId: emailMatches[0], matchType: "email" };
  }

  if (emailMatches.length > 1) {
    return { status: "ambiguous", candidateIds: emailMatches, matchType: "email" };
  }

  const nameKey = normalizeName(row.name);
  const scopedNameMatches = uniq(
    contactIndexes.byHealthSystemAndName.get(`${healthSystemId}|${nameKey}`) || []
  );
  if (scopedNameMatches.length === 1) {
    return { status: "matched", contactId: scopedNameMatches[0], matchType: "name_same_health_system" };
  }

  if (scopedNameMatches.length > 1) {
    return {
      status: "ambiguous",
      candidateIds: scopedNameMatches,
      matchType: "name_same_health_system"
    };
  }

  return { status: "new" };
}

async function loadDatabaseState(client) {
  const [healthSystems, contacts, links] = await Promise.all([
    client.healthSystem.findMany({
      select: {
        id: true,
        name: true,
        legalName: true,
        isAllianceMember: true,
        isLimitedPartner: true
      }
    }),
    client.contact.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        phone: true,
        linkedinUrl: true,
        principalEntityType: true,
        principalEntityId: true
      }
    }),
    client.$queryRawUnsafe(
      'SELECT id, "contactId", "healthSystemId", "roleType", COALESCE(title, \'\') AS title, "createdAt" FROM "ContactHealthSystem"'
    )
  ]);

  return { healthSystems, contacts, links };
}

async function applyOperations(client, plan) {
  const createdHealthSystemIdsByOrganization = new Map();
  const createdContactIdsByRow = new Map();

  for (const item of plan.healthSystemCreates) {
    const created = await client.healthSystem.create({
      data: {
        name: item.name,
        legalName: item.legalName,
        isLimitedPartner: false,
        isAllianceMember: false,
        allianceMemberStatus: "NO",
        researchStatus: "QUEUED",
        researchError: null,
        researchUpdatedAt: new Date()
      },
      select: { id: true }
    });
    createdHealthSystemIdsByOrganization.set(item.organization, created.id);

    await client.healthSystemResearchJob.create({
      data: {
        healthSystemId: created.id,
        status: "QUEUED",
        searchName: item.name,
        selectedCity: null,
        selectedState: null,
        selectedCountry: null,
        selectedWebsite: null
      }
    });
  }

  for (const item of plan.contactCreates) {
    const healthSystemId = item.healthSystemId.startsWith("planned-health-system:")
      ? createdHealthSystemIdsByOrganization.get(item.organization)
      : item.healthSystemId;

    const created = await client.contact.create({
      data: {
        name: item.name,
        title: item.title,
        email: item.email,
        phone: item.phone,
        principalEntityType: "HEALTH_SYSTEM",
        principalEntityId: healthSystemId
      },
      select: { id: true }
    });
    createdContactIdsByRow.set(item.rowNumber, created.id);
  }

  for (const item of plan.contactFieldUpdates) {
    await client.contact.update({
      where: { id: item.contactId },
      data: item.data
    });
  }

  for (const item of plan.linkCreates) {
    const healthSystemId = item.healthSystemId.startsWith("planned-health-system:")
      ? createdHealthSystemIdsByOrganization.get(item.organization)
      : item.healthSystemId;
    const contactId = item.contactId || createdContactIdsByRow.get(item.rowNumber);

    await client.$executeRawUnsafe(
      'INSERT INTO "ContactHealthSystem" ("id", "contactId", "healthSystemId", "roleType", "title", "createdAt", "updatedAt") VALUES ($1::text, $2::text, $3::text, $4::"ContactRoleType", $5::text, NOW(), NOW())',
      randomUUID(),
      contactId,
      healthSystemId,
      "EXECUTIVE",
      item.title
    );
  }

  for (const item of plan.linkUpdates) {
    await client.$executeRawUnsafe(
      'UPDATE "ContactHealthSystem" SET "title" = CASE WHEN COALESCE("title", \'\') = \'\' AND $2::text IS NOT NULL THEN $2::text ELSE "title" END, "updatedAt" = NOW() WHERE id = $1::text',
      item.linkId,
      item.title
    );
  }
}

async function buildPlan(client) {
  const csvRows = readCsvRows(CSV_PATH);
  const eligibleRows = csvRows.filter((row) => cleanCell(row.organization) && cleanCell(row.name));
  const { uniqueRows, duplicateRowCount } = dedupeRows(eligibleRows);
  const report = buildReportTemplate(csvRows, duplicateRowCount, uniqueRows);
  report.skippedBlankRows = csvRows.length - eligibleRows.length;

  const state = await loadDatabaseState(client);
  const lookup = buildHealthSystemLookup(state.healthSystems);
  const contactIndexes = buildContactIndexes(state.contacts, state.links);
  const plannedHealthSystemsByOrganization = new Map();
  const healthSystemsById = new Map(state.healthSystems.map((entry) => [entry.id, entry]));

  const plan = {
    summary: report,
    healthSystemCreates: [],
    contactCreates: [],
    contactFieldUpdates: [],
    linkCreates: [],
    linkUpdates: [],
    ambiguousHealthSystemRows: [],
    ambiguousContactRows: [],
    organizationPlans: new Map()
  };

  function ensureOrganizationPlan(organization) {
    const existing = plan.organizationPlans.get(organization);
    if (existing) return existing;

    const created = {
      organization,
      healthSystemAction: "match_existing",
      healthSystemName: null,
      rowCount: 0,
      contactCreates: 0,
      contactMatches: 0,
      linkCreates: 0,
      linkUpdates: 0,
      contactFieldUpdates: 0,
      existingIsAllianceMember: false,
      existingIsLimitedPartner: false
    };

    plan.organizationPlans.set(organization, created);
    return created;
  }

  for (const row of uniqueRows) {
    const organizationPlan = ensureOrganizationPlan(row.organization);
    organizationPlan.rowCount += 1;

    const healthSystemResolution = resolveHealthSystem(
      row,
      lookup,
      healthSystemsById,
      plannedHealthSystemsByOrganization
    );

    if (healthSystemResolution.status === "ambiguous") {
      plan.summary.ambiguousHealthSystemRows += 1;
      plan.ambiguousHealthSystemRows.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        name: row.name,
        email: row.email,
        candidateIds: healthSystemResolution.candidateIds
      });
      continue;
    }

    if (healthSystemResolution.status === "planned_create") {
      organizationPlan.healthSystemAction = "create";
      organizationPlan.healthSystemName = healthSystemResolution.healthSystemName;

      if (!plan.healthSystemCreates.some((entry) => entry.organization === row.organization)) {
        plan.healthSystemCreates.push({
          organization: row.organization,
          name: healthSystemResolution.healthSystemName,
          legalName: healthSystemResolution.healthSystemName
        });
        plan.summary.plannedHealthSystemCreates += 1;
      }
    } else {
      organizationPlan.healthSystemName = healthSystemResolution.healthSystemName;
      organizationPlan.existingIsAllianceMember = Boolean(
        healthSystemResolution.existingHealthSystem?.isAllianceMember
      );
      organizationPlan.existingIsLimitedPartner = Boolean(
        healthSystemResolution.existingHealthSystem?.isLimitedPartner
      );
      plan.summary.matchedExistingHealthSystems += 1;
      if (healthSystemResolution.existingHealthSystem?.isAllianceMember) {
        plan.summary.matchedExistingAllianceMemberRows += 1;
      }
      if (healthSystemResolution.existingHealthSystem?.isLimitedPartner) {
        plan.summary.matchedExistingLimitedPartnerRows += 1;
      }
    }

    const healthSystemId = healthSystemResolution.healthSystemId;
    const contactMatch = findContactMatch(row, healthSystemId, contactIndexes);

    if (contactMatch.status === "ambiguous") {
      plan.summary.ambiguousContactRows += 1;
      plan.ambiguousContactRows.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        name: row.name,
        email: row.email,
        phone: row.phone,
        matchType: contactMatch.matchType,
        candidateIds: contactMatch.candidateIds
      });
      continue;
    }

    let contactId = null;
    let contactChanged = false;

    if (contactMatch.status === "matched") {
      contactId = contactMatch.contactId;
      organizationPlan.contactMatches += 1;
      plan.summary.matchedExistingContacts += 1;

      const existingContact = contactIndexes.byId.get(contactId);
      const contactUpdateData = {};
      if (!existingContact.email && row.email) contactUpdateData.email = row.email;
      if (!existingContact.phone && row.phone) contactUpdateData.phone = row.phone;
      if (!existingContact.title && row.title) contactUpdateData.title = row.title;

      if (Object.keys(contactUpdateData).length > 0) {
        plan.contactFieldUpdates.push({
          rowNumber: row.rowNumber,
          organization: row.organization,
          contactId,
          contactName: existingContact.name,
          data: contactUpdateData
        });
        organizationPlan.contactFieldUpdates += 1;
        plan.summary.plannedContactFieldUpdates += 1;
        contactChanged = true;
        updateContactIndexes(contactIndexes, { ...existingContact, ...contactUpdateData });
      }
    } else {
      plan.contactCreates.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        healthSystemId,
        name: row.name,
        title: row.title,
        email: row.email,
        phone: row.phone
      });
      organizationPlan.contactCreates += 1;
      plan.summary.plannedContactCreates += 1;
      contactId = `planned-contact:${row.rowNumber}`;
      updateContactIndexes(contactIndexes, {
        id: contactId,
        name: row.name,
        title: row.title,
        email: row.email,
        phone: row.phone,
        linkedinUrl: null,
        principalEntityType: "HEALTH_SYSTEM",
        principalEntityId: healthSystemId
      });
    }

    const existingLinks = contactIndexes.linksByContactAndHealthSystem.get(`${contactId}|${healthSystemId}`) || [];
    const preferredLink = pickPreferredLink(existingLinks);

    if (!preferredLink) {
      plan.linkCreates.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        contactId: contactId.startsWith("planned-contact:") ? null : contactId,
        healthSystemId,
        title: row.title
      });
      organizationPlan.linkCreates += 1;
      plan.summary.plannedHealthSystemLinkCreates += 1;

      addLinkToIndexes(contactIndexes, {
        id: `planned-link:${row.rowNumber}`,
        contactId,
        healthSystemId,
        roleType: "EXECUTIVE",
        title: row.title || "",
        createdAt: new Date().toISOString()
      });
      continue;
    }

    const needsTitleUpdate = !cleanCell(preferredLink.title) && Boolean(row.title);
    if (needsTitleUpdate) {
      plan.linkUpdates.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        linkId: preferredLink.id,
        title: row.title
      });
      organizationPlan.linkUpdates += 1;
      plan.summary.plannedHealthSystemLinkUpdates += 1;
      preferredLink.title = row.title;
      continue;
    }

    if (!contactChanged) {
      plan.summary.noOpRows += 1;
    }
  }

  return {
    plan,
    organizationPlans: [...plan.organizationPlans.values()].sort((a, b) => a.organization.localeCompare(b.organization))
  };
}

async function main() {
  const { plan, organizationPlans } = await buildPlan(prisma);

  if (APPLY) {
    await applyOperations(prisma, plan);
  }

  printJson("summary", plan.summary);
  printJson("health_system_create_plan", plan.healthSystemCreates);
  printJson("organization_plan", organizationPlans);
  printJson("sample_contact_creates", plan.contactCreates.slice(0, 20));
  printJson("sample_contact_field_updates", plan.contactFieldUpdates.slice(0, 20));
  printJson("sample_link_creates", plan.linkCreates.slice(0, 20));
  printJson("sample_link_updates", plan.linkUpdates.slice(0, 20));
  printJson("ambiguous_health_system_rows", plan.ambiguousHealthSystemRows);
  printJson("ambiguous_contact_rows", plan.ambiguousContactRows);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
