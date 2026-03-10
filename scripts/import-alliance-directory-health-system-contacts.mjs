#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CSV_PATH =
  process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ||
  path.join(process.env.HOME || "", "Downloads", "Alliance Directory For CRM - Email Directory.csv");

const MANUAL_HEALTH_SYSTEM_DECISIONS = {
  Kansas: { type: "existing_alias", targetName: "The University of Kansas Health System" },
  SLUHN: { type: "existing_alias", targetName: "St. Luke's University Health Network" },
  RUSH: { type: "create", createName: "Rush University System for Health" },
  Confluence: { type: "create", createName: "Confluence Health" },
  Lurie: { type: "create", createName: "Ann & Robert H. Lurie Children's Hospital of Chicago" },
  Northwestern: { type: "create", createName: "Northwestern Medicine" }
};

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

const nicknameGroups = [
  ["william", ["bill", "billy", "will", "willy", "liam"]],
  ["robert", ["bob", "bobby", "rob", "robbie"]],
  ["richard", ["rick", "ricky", "rich", "dick"]],
  ["margaret", ["maggie", "meg", "peggy"]],
  ["elizabeth", ["liz", "beth", "lizzie", "eliza"]],
  ["james", ["jim", "jimmy"]],
  ["joseph", ["joe", "joey"]],
  ["michael", ["mike", "mikey"]],
  ["andrew", ["andy", "drew"]],
  ["katherine", ["kate", "katie", "kathy", "kat"]],
  ["christopher", ["chris"]],
  ["daniel", ["dan", "danny"]],
  ["anthony", ["tony"]],
  ["steven", ["steve"]],
  ["thomas", ["tom", "tommy"]],
  ["alexander", ["alex", "xander"]],
  ["john", ["johnny", "jack"]],
  ["edward", ["ed", "eddie", "ted", "teddy"]]
];

const nicknameMap = (() => {
  const map = new Map();
  for (const [canonical, aliases] of nicknameGroups) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(alias, canonical);
    }
  }
  return map;
})();

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

function normalizeWhitespace(value) {
  return cleanCell(value).replace(/\s+/g, " ");
}

function splitCamelCase(value) {
  return cleanCell(value).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function normalizeName(value) {
  return splitCamelCase(value)
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
      /\b(the|of|and|inc|incorporated|corp|corporation|company|llc|ltd|health|healthcare|care|system|services|service|network|foundation|medical|hospital|center|centre|plan|partners)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForComparison(value) {
  return cleanCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value) {
  const normalized = cleanCell(value).toLowerCase();
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeLinkedinUrl(value) {
  const trimmed = cleanCell(value);
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/+$/g, "");
    return `https://${host}${pathname || ""}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/g, "");
  }
}

function normalizeDomain(value) {
  const domain = cleanCell(value).toLowerCase();
  if (!domain) return null;
  return domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
}

function extractEmailDomain(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) return null;
  return normalizeDomain(normalized.slice(atIndex + 1));
}

function addToSetMap(map, key, value) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }
  map.set(key, new Set([value]));
}

function takeSingle(set) {
  if (!set || set.size !== 1) return null;
  for (const value of set) return value;
  return null;
}

function canonicalizeFirstName(value) {
  return nicknameMap.get(value) || value;
}

function parseName(value) {
  const normalizedFull = normalizeForComparison(value);
  const parts = normalizedFull.split(" ").filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return {
    normalizedFull,
    firstName,
    lastName,
    canonicalFirstName: canonicalizeFirstName(firstName)
  };
}

function scoreNameMatch(candidate, existingName) {
  if (!existingName) return 0;

  const existing = parseName(existingName);
  if (!candidate.normalizedFull || !existing.normalizedFull) return 0;

  if (candidate.normalizedFull === existing.normalizedFull) return 0.95;

  const lastMatches = candidate.lastName && existing.lastName && candidate.lastName === existing.lastName;
  const firstMatches = candidate.firstName && existing.firstName && candidate.firstName === existing.firstName;
  const canonicalFirstMatches =
    candidate.canonicalFirstName &&
    existing.canonicalFirstName &&
    candidate.canonicalFirstName === existing.canonicalFirstName;
  const initialMatches =
    candidate.firstName &&
    existing.firstName &&
    candidate.firstName.charAt(0) === existing.firstName.charAt(0);

  if (lastMatches && firstMatches) return 0.93;
  if (lastMatches && canonicalFirstMatches) return 0.88;
  if (lastMatches && initialMatches) return 0.8;
  if (canonicalFirstMatches && candidate.lastName && !existing.lastName) return 0.74;
  if (canonicalFirstMatches) return 0.7;

  return 0;
}

function scoreTitleMatch(candidateTitle, existingTitle) {
  const a = normalizeForComparison(candidateTitle);
  const b = normalizeForComparison(existingTitle);
  if (!a || !b) return 0;
  if (a === b) return 0.08;

  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  return ratio >= 0.5 ? 0.05 : 0;
}

function readCsvRows(csvPath) {
  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error(`CSV has no rows: ${csvPath}`);

  const header = rows[0].map((cell) => cleanCell(cell));
  const indexByHeader = new Map(header.map((value, index) => [value, index]));

  const requiredHeaders = ["Organization", "Email", "Name", "To:", "CC / Optional:", "Title", "LinkedIn"];
  for (const requiredHeader of requiredHeaders) {
    if (!indexByHeader.has(requiredHeader)) {
      throw new Error(`Missing expected header "${requiredHeader}" in ${csvPath}`);
    }
  }

  const parsed = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const organization = normalizeWhitespace(row[indexByHeader.get("Organization")]);
    const email = normalizeEmail(row[indexByHeader.get("Email")]);
    const name = normalizeWhitespace(row[indexByHeader.get("Name")]);
    const title = normalizeWhitespace(row[indexByHeader.get("Title")]) || null;
    const linkedinUrl = normalizeLinkedinUrl(row[indexByHeader.get("LinkedIn")]);
    const keyValue = cleanCell(row[indexByHeader.get("To:")]);
    const informedValue = cleanCell(row[indexByHeader.get("CC / Optional:")]);

    if (!organization && !email && !name) continue;

    parsed.push({
      rowNumber: i + 1,
      organization,
      email,
      name,
      title,
      linkedinUrl,
      isKeyAllianceContact: keyValue === "1",
      isInformedAllianceContact: informedValue === "1"
    });
  }

  return parsed;
}

function dedupeRows(rows) {
  const dedupe = new Set();
  const uniqueRows = [];
  let duplicateRowCount = 0;

  for (const row of rows) {
    const dedupeKey = [
      normalizeName(row.organization),
      normalizeForComparison(row.name),
      row.email || "",
      row.linkedinUrl || ""
    ].join("|");

    if (dedupe.has(dedupeKey)) {
      duplicateRowCount += 1;
      continue;
    }

    dedupe.add(dedupeKey);
    uniqueRows.push(row);
  }

  return { uniqueRows, duplicateRowCount };
}

function buildHealthSystemLookup(healthSystems) {
  const exactMap = new Map();
  const looseMap = new Map();
  const domainMap = new Map();

  for (const healthSystem of healthSystems) {
    for (const value of [healthSystem.name, healthSystem.legalName]) {
      const exact = normalizeName(value);
      if (exact) addToSetMap(exactMap, exact, healthSystem.id);

      const loose = normalizeNameLoose(value);
      if (loose) addToSetMap(looseMap, loose, healthSystem.id);
    }

    const domain = normalizeDomain(healthSystem.website);
    if (domain) addToSetMap(domainMap, domain, healthSystem.id);
  }

  return { exactMap, looseMap, domainMap };
}

function buildContactIndexes(contacts, healthSystemLinks) {
  const byId = new Map();
  const byEmail = new Map();
  const byLinkedin = new Map();
  const linksByContactAndHealthSystem = new Map();
  const healthSystemIdsByContactId = new Map();

  for (const contact of contacts) {
    byId.set(contact.id, { ...contact });
    if (contact.email) addToSetMap(byEmail, normalizeEmail(contact.email), contact.id);
    if (contact.linkedinUrl) addToSetMap(byLinkedin, normalizeLinkedinUrl(contact.linkedinUrl), contact.id);
  }

  for (const link of healthSystemLinks) {
    const key = `${link.contactId}|${link.healthSystemId}`;
    const existingLinks = linksByContactAndHealthSystem.get(key) || [];
    existingLinks.push({ ...link });
    linksByContactAndHealthSystem.set(key, existingLinks);

    const systemIds = healthSystemIdsByContactId.get(link.contactId);
    if (systemIds) {
      systemIds.add(link.healthSystemId);
    } else {
      healthSystemIdsByContactId.set(link.contactId, new Set([link.healthSystemId]));
    }
  }

  return {
    byId,
    byEmail,
    byLinkedin,
    linksByContactAndHealthSystem,
    healthSystemIdsByContactId
  };
}

function resolveHealthSystem(row, lookup, createdHealthSystemsByOrganization) {
  const orgKey = normalizeName(row.organization);
  const manualDecision = MANUAL_HEALTH_SYSTEM_DECISIONS[row.organization];
  const aliasTarget =
    manualDecision?.type === "existing_alias"
      ? normalizeName(manualDecision.targetName)
      : ADDITIONAL_EXISTING_ALIASES.get(orgKey) || null;

  const exactCandidates = [];
  if (aliasTarget) exactCandidates.push(aliasTarget);
  if (orgKey) exactCandidates.push(orgKey);

  for (const candidate of exactCandidates) {
    const exactMatch = takeSingle(lookup.exactMap.get(candidate));
    if (exactMatch) {
      return {
        status: "matched",
        healthSystemId: exactMatch,
        matchType: candidate === aliasTarget ? "alias" : "exact"
      };
    }
  }

  for (const candidate of exactCandidates) {
    const looseKey = normalizeNameLoose(candidate);
    if (!looseKey) continue;
    const looseMatch = takeSingle(lookup.looseMap.get(looseKey));
    if (looseMatch) {
      return { status: "matched", healthSystemId: looseMatch, matchType: "loose" };
    }
  }

  const emailDomain = extractEmailDomain(row.email);
  if (emailDomain) {
    const directDomainMatch = takeSingle(lookup.domainMap.get(emailDomain));
    if (directDomainMatch) {
      return { status: "matched", healthSystemId: directDomainMatch, matchType: "email_domain" };
    }

    for (const [domain, ids] of lookup.domainMap.entries()) {
      if (ids.size !== 1) continue;
      if (emailDomain === domain || emailDomain.endsWith(`.${domain}`) || domain.endsWith(`.${emailDomain}`)) {
        return {
          status: "matched",
          healthSystemId: takeSingle(ids),
          matchType: "email_domain_fuzzy"
        };
      }
    }
  }

  if (manualDecision?.type === "create") {
    const existingCreated = createdHealthSystemsByOrganization.get(row.organization);
    if (existingCreated) {
      return {
        status: "planned_create",
        healthSystemId: existingCreated.id,
        healthSystemName: existingCreated.name
      };
    }

    const plannedId = `planned:${row.organization}`;
    const planned = {
      id: plannedId,
      name: manualDecision.createName,
      legalName: manualDecision.createName,
      website: emailDomain ? `https://${emailDomain}` : null
    };
    createdHealthSystemsByOrganization.set(row.organization, planned);

    return {
      status: "planned_create",
      healthSystemId: planned.id,
      healthSystemName: planned.name
    };
  }

  return { status: "unmatched" };
}

function findContactMatch(row, healthSystemId, indexes) {
  const linkedin = normalizeLinkedinUrl(row.linkedinUrl);
  if (linkedin) {
    const ids = indexes.byLinkedin.get(linkedin);
    const uniqueId = takeSingle(ids);
    if (uniqueId) {
      return {
        status: "matched",
        matchedBy: "linkedin",
        contactId: uniqueId,
        confidence: 0.99
      };
    }
  }

  const email = normalizeEmail(row.email);
  if (email) {
    const ids = indexes.byEmail.get(email);
    const uniqueId = takeSingle(ids);
    if (uniqueId) {
      return {
        status: "matched",
        matchedBy: "email",
        contactId: uniqueId,
        confidence: 0.99
      };
    }
  }

  const parsed = parseName(row.name);
  if (!parsed.normalizedFull) return { status: "unmatched" };

  let best = null;
  let secondBest = null;

  for (const contact of indexes.byId.values()) {
    const nameScore = scoreNameMatch(parsed, contact.name);
    if (nameScore <= 0) continue;

    const titleScore = scoreTitleMatch(row.title, contact.title);
    const linkedToHealthSystem = Boolean(indexes.healthSystemIdsByContactId.get(contact.id)?.has(healthSystemId));
    const score = nameScore + titleScore + (linkedToHealthSystem ? 0.04 : 0);
    const candidate = { contactId: contact.id, score, linkedToHealthSystem };

    if (!best || candidate.score > best.score) {
      secondBest = best;
      best = candidate;
    } else if (!secondBest || candidate.score > secondBest.score) {
      secondBest = candidate;
    }
  }

  if (!best || best.score < 0.75) return { status: "unmatched" };

  if (secondBest && best.score - secondBest.score < 0.04) {
    return { status: "ambiguous", candidateIds: [best.contactId, secondBest.contactId] };
  }

  return {
    status: "matched",
    matchedBy: best.linkedToHealthSystem ? "name_same_health_system" : "name",
    contactId: best.contactId,
    confidence: Number(best.score.toFixed(2))
  };
}

function pickPreferredLink(links) {
  if (!links || links.length === 0) return null;

  const executive = links.find((link) => link.roleType === "EXECUTIVE");
  if (executive) return executive;

  return [...links].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
}

function addLinkToIndexes(indexes, link) {
  const key = `${link.contactId}|${link.healthSystemId}`;
  const existingLinks = indexes.linksByContactAndHealthSystem.get(key) || [];
  existingLinks.push({ ...link });
  indexes.linksByContactAndHealthSystem.set(key, existingLinks);

  const systemIds = indexes.healthSystemIdsByContactId.get(link.contactId);
  if (systemIds) {
    systemIds.add(link.healthSystemId);
  } else {
    indexes.healthSystemIdsByContactId.set(link.contactId, new Set([link.healthSystemId]));
  }
}

function updateContactIndexes(indexes, contact) {
  const previous = indexes.byId.get(contact.id);
  if (previous?.email && normalizeEmail(previous.email) !== normalizeEmail(contact.email)) {
    const priorEmailIds = indexes.byEmail.get(normalizeEmail(previous.email));
    if (priorEmailIds) priorEmailIds.delete(contact.id);
  }
  if (previous?.linkedinUrl && normalizeLinkedinUrl(previous.linkedinUrl) !== normalizeLinkedinUrl(contact.linkedinUrl)) {
    const priorLinkedinIds = indexes.byLinkedin.get(normalizeLinkedinUrl(previous.linkedinUrl));
    if (priorLinkedinIds) priorLinkedinIds.delete(contact.id);
  }

  indexes.byId.set(contact.id, { ...contact });
  if (contact.email) addToSetMap(indexes.byEmail, normalizeEmail(contact.email), contact.id);
  if (contact.linkedinUrl) addToSetMap(indexes.byLinkedin, normalizeLinkedinUrl(contact.linkedinUrl), contact.id);
}

function buildReportTemplate(csvRows, duplicateRowCount, uniqueRows) {
  return {
    mode: APPLY ? "apply" : "dry_run",
    csvPath: CSV_PATH,
    csvRows: csvRows.length,
    duplicateRowsSkipped: duplicateRowCount,
    uniqueRowsAnalyzed: uniqueRows.length,
    skippedBlankNameRows: 0,
    plannedHealthSystemCreates: 0,
    matchedExistingHealthSystems: 0,
    plannedContactCreates: 0,
    matchedExistingContacts: 0,
    plannedContactFieldUpdates: 0,
    plannedHealthSystemLinkCreates: 0,
    plannedHealthSystemLinkUpdates: 0,
    noOpRows: 0,
    unresolvedRows: 0,
    ambiguousContactRows: 0
  };
}

function printJson(label, value) {
  console.log(`${label}=${JSON.stringify(value)}`);
}

async function loadAllianceFlagSchema(client) {
  const columns = await client.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ContactHealthSystem' AND column_name IN ('isKeyAllianceContact', 'isInformedAllianceContact')"
  );

  const columnNames = new Set(columns.map((column) => column.column_name));

  return {
    hasKeyAllianceContact: columnNames.has("isKeyAllianceContact"),
    hasInformedAllianceContact: columnNames.has("isInformedAllianceContact")
  };
}

async function loadDatabaseState(client) {
  const allianceFlagSchema = await loadAllianceFlagSchema(client);
  const keyAllianceSelect = allianceFlagSchema.hasKeyAllianceContact
    ? 'COALESCE("isKeyAllianceContact", false)'
    : "false";
  const informedAllianceSelect = allianceFlagSchema.hasInformedAllianceContact
    ? 'COALESCE("isInformedAllianceContact", false)'
    : "false";

  const [healthSystems, contacts, links] = await Promise.all([
    client.healthSystem.findMany({
      select: {
        id: true,
        name: true,
        legalName: true,
        website: true
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
      `SELECT id, "contactId", "healthSystemId", "roleType", COALESCE(title, '') AS title, ${keyAllianceSelect} AS "isKeyAllianceContact", ${informedAllianceSelect} AS "isInformedAllianceContact", "createdAt" FROM "ContactHealthSystem"`
    )
  ]);

  return { healthSystems, contacts, links, allianceFlagSchema };
}

async function applyOperations(client, plan) {
  const createdHealthSystemIdsByOrg = new Map();
  const createdContactIdsByRow = new Map();

  for (const item of plan.healthSystemCreates) {
    const created = await client.healthSystem.create({
      data: {
        name: item.name,
        legalName: item.legalName,
        website: item.website,
        isAllianceMember: true,
        allianceMemberStatus: "YES"
      },
      select: { id: true }
    });
    createdHealthSystemIdsByOrg.set(item.organization, created.id);
  }

  for (const item of plan.contactCreates) {
    const healthSystemId = item.healthSystemId.startsWith("planned:")
      ? createdHealthSystemIdsByOrg.get(item.organization)
      : item.healthSystemId;

    const created = await client.contact.create({
      data: {
        name: item.name,
        title: item.title,
        email: item.email,
        linkedinUrl: item.linkedinUrl,
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
    const healthSystemId = item.healthSystemId.startsWith("planned:")
      ? createdHealthSystemIdsByOrg.get(item.organization)
      : item.healthSystemId;
    const contactId = item.contactId || createdContactIdsByRow.get(item.rowNumber);

    await client.$executeRawUnsafe(
      'INSERT INTO "ContactHealthSystem" ("id", "contactId", "healthSystemId", "roleType", "title", "isKeyAllianceContact", "isInformedAllianceContact", "createdAt", "updatedAt") VALUES ($1::text, $2::text, $3::text, $4::"ContactRoleType", $5::text, $6::boolean, $7::boolean, NOW(), NOW())',
      randomUUID(),
      contactId,
      healthSystemId,
      "EXECUTIVE",
      item.title,
      item.isKeyAllianceContact,
      item.isInformedAllianceContact
    );
  }

  for (const item of plan.linkUpdates) {
    await client.$executeRawUnsafe(
      'UPDATE "ContactHealthSystem" SET "title" = CASE WHEN COALESCE("title", \'\') = \'\' AND $2::text IS NOT NULL THEN $2::text ELSE "title" END, "isKeyAllianceContact" = CASE WHEN $3::boolean THEN true ELSE "isKeyAllianceContact" END, "isInformedAllianceContact" = CASE WHEN $4::boolean THEN true ELSE "isInformedAllianceContact" END, "updatedAt" = NOW() WHERE id = $1::text',
      item.linkId,
      item.title,
      item.isKeyAllianceContact,
      item.isInformedAllianceContact
    );
  }
}

async function buildPlan(client) {
  const csvRows = readCsvRows(CSV_PATH);
  const rowsWithNames = csvRows.filter((row) => Boolean(cleanCell(row.name)));
  const { uniqueRows, duplicateRowCount } = dedupeRows(rowsWithNames);
  const report = buildReportTemplate(csvRows, duplicateRowCount, uniqueRows);
  report.skippedBlankNameRows = csvRows.length - rowsWithNames.length;
  const state = await loadDatabaseState(client);

  const lookup = buildHealthSystemLookup(state.healthSystems);
  const contactIndexes = buildContactIndexes(state.contacts, state.links);
  const createdHealthSystemsByOrganization = new Map();
  const healthSystemById = new Map(state.healthSystems.map((entry) => [entry.id, entry]));

  const plan = {
    summary: report,
    allianceFlagSchema: state.allianceFlagSchema,
    healthSystemCreates: [],
    contactCreates: [],
    contactFieldUpdates: [],
    linkCreates: [],
    linkUpdates: [],
    unresolvedRows: [],
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
      contactFieldUpdates: 0
    };
    plan.organizationPlans.set(organization, created);
    return created;
  }

  for (const row of uniqueRows) {
    const organizationPlan = ensureOrganizationPlan(row.organization);
    organizationPlan.rowCount += 1;

    const healthSystemResolution = resolveHealthSystem(row, lookup, createdHealthSystemsByOrganization);
    if (healthSystemResolution.status === "unmatched") {
      plan.summary.unresolvedRows += 1;
      plan.unresolvedRows.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        name: row.name,
        email: row.email
      });
      continue;
    }

    if (healthSystemResolution.status === "planned_create") {
      organizationPlan.healthSystemAction = "create";
      organizationPlan.healthSystemName = healthSystemResolution.healthSystemName;

      if (!plan.healthSystemCreates.some((entry) => entry.organization === row.organization)) {
        const plannedHealthSystem = createdHealthSystemsByOrganization.get(row.organization);
        plan.healthSystemCreates.push({
          organization: row.organization,
          name: plannedHealthSystem.name,
          legalName: plannedHealthSystem.legalName,
          website: plannedHealthSystem.website,
          allianceMemberStatus: "YES"
        });
        plan.summary.plannedHealthSystemCreates += 1;
      }
    } else {
      organizationPlan.healthSystemName = healthSystemById.get(healthSystemResolution.healthSystemId)?.name || null;
      plan.summary.matchedExistingHealthSystems += 1;
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
      if (!existingContact.title && row.title) contactUpdateData.title = row.title;
      if (!existingContact.linkedinUrl && row.linkedinUrl) contactUpdateData.linkedinUrl = row.linkedinUrl;

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
        updateContactIndexes(contactIndexes, {
          ...existingContact,
          ...contactUpdateData
        });
      }
    } else {
      plan.contactCreates.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        healthSystemId,
        name: row.name,
        title: row.title,
        email: row.email,
        linkedinUrl: row.linkedinUrl
      });
      organizationPlan.contactCreates += 1;
      plan.summary.plannedContactCreates += 1;
      contactId = `planned-contact:${row.rowNumber}`;
      updateContactIndexes(contactIndexes, {
        id: contactId,
        name: row.name,
        title: row.title,
        email: row.email,
        phone: null,
        linkedinUrl: row.linkedinUrl,
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
        title: row.title,
        isKeyAllianceContact: row.isKeyAllianceContact,
        isInformedAllianceContact: row.isInformedAllianceContact
      });
      organizationPlan.linkCreates += 1;
      plan.summary.plannedHealthSystemLinkCreates += 1;

      addLinkToIndexes(contactIndexes, {
        id: `planned-link:${row.rowNumber}`,
        contactId,
        healthSystemId,
        roleType: "EXECUTIVE",
        title: row.title || "",
        isKeyAllianceContact: row.isKeyAllianceContact,
        isInformedAllianceContact: row.isInformedAllianceContact,
        createdAt: new Date().toISOString()
      });
      continue;
    }

    const needsTitleUpdate = !cleanCell(preferredLink.title) && Boolean(row.title);
    const needsKeyUpdate = row.isKeyAllianceContact && !preferredLink.isKeyAllianceContact;
    const needsInformedUpdate = row.isInformedAllianceContact && !preferredLink.isInformedAllianceContact;

    if (needsTitleUpdate || needsKeyUpdate || needsInformedUpdate) {
      plan.linkUpdates.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        linkId: preferredLink.id,
        title: needsTitleUpdate ? row.title : null,
        isKeyAllianceContact: needsKeyUpdate,
        isInformedAllianceContact: needsInformedUpdate
      });
      organizationPlan.linkUpdates += 1;
      plan.summary.plannedHealthSystemLinkUpdates += 1;

      preferredLink.title = cleanCell(preferredLink.title) || row.title || preferredLink.title;
      preferredLink.isKeyAllianceContact = preferredLink.isKeyAllianceContact || row.isKeyAllianceContact;
      preferredLink.isInformedAllianceContact =
        preferredLink.isInformedAllianceContact || row.isInformedAllianceContact;
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
  plan.summary.allianceFlagSchema = plan.allianceFlagSchema;

  if (APPLY) {
    if (!plan.allianceFlagSchema.hasKeyAllianceContact || !plan.allianceFlagSchema.hasInformedAllianceContact) {
      const missingColumns = [
        !plan.allianceFlagSchema.hasKeyAllianceContact ? "isKeyAllianceContact" : null,
        !plan.allianceFlagSchema.hasInformedAllianceContact ? "isInformedAllianceContact" : null
      ].filter(Boolean);

      throw new Error(
        `Cannot apply import because ContactHealthSystem is missing required columns: ${missingColumns.join(", ")}. Run the production schema migration first.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await applyOperations(tx, plan);
    });
  }

  printJson("summary", plan.summary);
  printJson("health_system_create_plan", plan.healthSystemCreates);
  printJson("organization_plan", organizationPlans);
  printJson("sample_contact_creates", plan.contactCreates.slice(0, 20));
  printJson("sample_contact_field_updates", plan.contactFieldUpdates.slice(0, 20));
  printJson("sample_link_creates", plan.linkCreates.slice(0, 20));
  printJson("sample_link_updates", plan.linkUpdates.slice(0, 20));
  printJson("unresolved_rows", plan.unresolvedRows);
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
