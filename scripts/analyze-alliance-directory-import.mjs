#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CSV_PATH =
  process.argv[2] ||
  path.join(process.env.HOME || "", "Downloads", "Alliance Directory For CRM - Email Directory.csv");

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
    ChristianaCare: "Christiana Care Health Services, Inc.",
    "MUSC Health": "MUSC Health (Medical Univ. of SC)",
    "Allegheny Health Network": "Allegheny Health Network",
    "Sutter Health": "Sutter Health",
    "Texas Health": "Texas Health Resources",
    "UChicago Medicine": "The University of Chicago Medical Center",
    "University Hospitals": "University Hospitals Health System, Inc.",
    Kansas: "The University of Kansas Health System",
    SLUHN: "St. Luke's University Health Network"
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
    for (const alias of aliases) map.set(alias, canonical);
  }
  return map;
})();

function canonicalizeFirstName(value) {
  return nicknameMap.get(value) || value;
}

function normalizeForComparison(value) {
  return cleanCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (rows.length === 0) {
    throw new Error(`CSV has no rows: ${csvPath}`);
  }

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
      isInformedAllianceContact: informedValue === "1",
      rawKeyValue: keyValue,
      rawInformedValue: informedValue
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

function matchHealthSystem(row, lookup) {
  const orgKey = normalizeName(row.organization);
  const aliasTarget = ACCOUNT_NAME_ALIASES.get(orgKey);

  const exactCandidates = [];
  if (aliasTarget) exactCandidates.push(aliasTarget);
  if (orgKey) exactCandidates.push(orgKey);

  for (const candidate of exactCandidates) {
    const match = takeSingle(lookup.exactMap.get(candidate));
    if (match) {
      return { status: "matched", matchType: candidate === aliasTarget ? "alias" : "exact", healthSystemId: match };
    }

    const candidates = lookup.exactMap.get(candidate);
    if (candidates && candidates.size > 1) {
      return { status: "ambiguous", matchType: "exact", candidateIds: [...candidates] };
    }
  }

  for (const candidate of exactCandidates) {
    const looseKey = normalizeNameLoose(candidate);
    if (!looseKey) continue;
    const candidates = lookup.looseMap.get(looseKey);
    const match = takeSingle(candidates);
    if (match) {
      return { status: "matched", matchType: "loose", healthSystemId: match };
    }
    if (candidates && candidates.size > 1) {
      return { status: "ambiguous", matchType: "loose", candidateIds: [...candidates] };
    }
  }

  const emailDomain = extractEmailDomain(row.email);
  if (emailDomain) {
    const candidates = lookup.domainMap.get(emailDomain);
    const direct = takeSingle(candidates);
    if (direct) {
      return { status: "matched", matchType: "email_domain", healthSystemId: direct };
    }
    if (candidates && candidates.size > 1) {
      return { status: "ambiguous", matchType: "email_domain", candidateIds: [...candidates] };
    }

    for (const [domain, ids] of lookup.domainMap.entries()) {
      if (ids.size !== 1) continue;
      if (emailDomain === domain || emailDomain.endsWith(`.${domain}`) || domain.endsWith(`.${emailDomain}`)) {
        return { status: "matched", matchType: "email_domain_fuzzy", healthSystemId: takeSingle(ids) };
      }
    }
  }

  return { status: "unmatched" };
}

function buildContactIndexes(contacts, contactHealthSystemLinks) {
  const byEmail = new Map();
  const byLinkedin = new Map();
  const byId = new Map();
  const healthSystemIdsByContactId = new Map();

  for (const contact of contacts) {
    byId.set(contact.id, contact);
    if (contact.email) addToSetMap(byEmail, normalizeEmail(contact.email), contact.id);
    if (contact.linkedinUrl) addToSetMap(byLinkedin, normalizeLinkedinUrl(contact.linkedinUrl), contact.id);
  }

  for (const link of contactHealthSystemLinks) {
    const existing = healthSystemIdsByContactId.get(link.contactId);
    if (existing) {
      existing.add(link.healthSystemId);
      continue;
    }
    healthSystemIdsByContactId.set(link.contactId, new Set([link.healthSystemId]));
  }

  return { byEmail, byLinkedin, byId, healthSystemIdsByContactId };
}

function findContactMatch(row, matchedHealthSystemId, indexes) {
  const linkedin = normalizeLinkedinUrl(row.linkedinUrl);
  if (linkedin) {
    const ids = indexes.byLinkedin.get(linkedin);
    const uniqueId = takeSingle(ids);
    if (uniqueId) {
      return {
        status: "matched",
        matchedBy: "linkedin",
        contactId: uniqueId,
        confidence: 0.99,
        alreadyLinkedToHealthSystem: Boolean(
          matchedHealthSystemId && indexes.healthSystemIdsByContactId.get(uniqueId)?.has(matchedHealthSystemId)
        )
      };
    }
    if (ids && ids.size > 1) {
      return { status: "ambiguous", matchedBy: "linkedin", candidateIds: [...ids] };
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
        confidence: 0.99,
        alreadyLinkedToHealthSystem: Boolean(
          matchedHealthSystemId && indexes.healthSystemIdsByContactId.get(uniqueId)?.has(matchedHealthSystemId)
        )
      };
    }
    if (ids && ids.size > 1) {
      return { status: "ambiguous", matchedBy: "email", candidateIds: [...ids] };
    }
  }

  const parsed = parseName(row.name);
  if (!parsed.normalizedFull) {
    return { status: "unmatched" };
  }

  let best = null;
  let secondBest = null;

  for (const contact of indexes.byId.values()) {
    const nameScore = scoreNameMatch(parsed, contact.name);
    if (nameScore <= 0) continue;

    const titleScore = scoreTitleMatch(row.title, contact.title);
    const linkedToHealthSystem = Boolean(
      matchedHealthSystemId && indexes.healthSystemIdsByContactId.get(contact.id)?.has(matchedHealthSystemId)
    );
    const score = nameScore + titleScore + (linkedToHealthSystem ? 0.04 : 0);
    const candidate = {
      contactId: contact.id,
      score,
      linkedToHealthSystem
    };

    if (!best || candidate.score > best.score) {
      secondBest = best;
      best = candidate;
    } else if (!secondBest || candidate.score > secondBest.score) {
      secondBest = candidate;
    }
  }

  if (!best || best.score < 0.75) {
    return { status: "unmatched" };
  }

  if (secondBest && best.score - secondBest.score < 0.04) {
    return {
      status: "ambiguous",
      matchedBy: best.linkedToHealthSystem ? "name_same_health_system" : "name",
      candidateIds: [best.contactId, secondBest.contactId]
    };
  }

  return {
    status: "matched",
    matchedBy: best.linkedToHealthSystem ? "name_same_health_system" : "name",
    contactId: best.contactId,
    confidence: Number(best.score.toFixed(2)),
    alreadyLinkedToHealthSystem: best.linkedToHealthSystem
  };
}

function printJson(label, value) {
  console.log(`${label}=${JSON.stringify(value)}`);
}

async function main() {
  const allRows = readCsvRows(CSV_PATH);
  const { uniqueRows, duplicateRowCount } = dedupeRows(allRows);

  const [healthSystems, contacts, contactHealthSystemLinks] = await Promise.all([
    prisma.healthSystem.findMany({
      select: {
        id: true,
        name: true,
        legalName: true,
        website: true
      }
    }),
    prisma.contact.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        linkedinUrl: true
      }
    }),
    prisma.$queryRawUnsafe(
      'SELECT "contactId", "healthSystemId", COALESCE("title", \'\') AS "title", COALESCE("isKeyAllianceContact", false) AS "isKeyAllianceContact", COALESCE("isInformedAllianceContact", false) AS "isInformedAllianceContact" FROM "ContactHealthSystem"'
    )
  ]);

  const lookup = buildHealthSystemLookup(healthSystems);
  const contactIndexes = buildContactIndexes(contacts, contactHealthSystemLinks);
  const healthSystemById = new Map(healthSystems.map((entry) => [entry.id, entry]));

  const summary = {
    csvRows: allRows.length,
    duplicateRowsSkipped: duplicateRowCount,
    uniqueRowsAnalyzed: uniqueRows.length,
    uniqueOrganizations: new Set(uniqueRows.map((row) => row.organization)).size,
    healthSystemMatchedRows: 0,
    healthSystemAmbiguousRows: 0,
    healthSystemUnmatchedRows: 0,
    contactMatchedRows: 0,
    contactAmbiguousRows: 0,
    contactUnmatchedRows: 0,
    newContactsWouldBeCreated: 0,
    existingContactsMatched: 0,
    existingContactsAlreadyLinkedToMatchedHealthSystem: 0,
    existingContactsNeedingNewHealthSystemLink: 0,
    matchedBy: {
      healthSystem: {
        exact: 0,
        alias: 0,
        loose: 0,
        email_domain: 0,
        email_domain_fuzzy: 0
      },
      contact: {
        email: 0,
        linkedin: 0,
        name: 0,
        name_same_health_system: 0
      }
    },
    rowsFlaggedKeyAlliance: uniqueRows.filter((row) => row.isKeyAllianceContact).length,
    rowsFlaggedInformedAlliance: uniqueRows.filter((row) => row.isInformedAllianceContact).length
  };

  const unresolvedOrganizations = new Map();
  const ambiguousOrganizations = new Map();
  const ambiguousContacts = [];
  const enrichment = {
    matchedContactsMissingEmail: 0,
    matchedContactsMissingTitle: 0,
    matchedContactsMissingLinkedin: 0,
    matchedHealthSystemLinksMissingTitle: 0,
    matchedHealthSystemLinksMissingKeyFlag: 0,
    matchedHealthSystemLinksMissingInformedFlag: 0
  };

  const linkByContactAndHealthSystem = new Map();
  for (const link of contactHealthSystemLinks) {
    const key = `${link.contactId}|${link.healthSystemId}`;
    if (!linkByContactAndHealthSystem.has(key)) {
      linkByContactAndHealthSystem.set(key, link);
    }
  }

  for (const row of uniqueRows) {
    const healthSystemMatch = matchHealthSystem(row, lookup);

    if (healthSystemMatch.status === "matched") {
      summary.healthSystemMatchedRows += 1;
      summary.matchedBy.healthSystem[healthSystemMatch.matchType] += 1;
    } else if (healthSystemMatch.status === "ambiguous") {
      summary.healthSystemAmbiguousRows += 1;
      const names = healthSystemMatch.candidateIds.map((id) => healthSystemById.get(id)?.name).filter(Boolean);
      ambiguousOrganizations.set(row.organization, names);
      continue;
    } else {
      summary.healthSystemUnmatchedRows += 1;
      unresolvedOrganizations.set(row.organization, (unresolvedOrganizations.get(row.organization) || 0) + 1);
      continue;
    }

    const contactMatch = findContactMatch(row, healthSystemMatch.healthSystemId, contactIndexes);
    if (contactMatch.status === "matched") {
      summary.contactMatchedRows += 1;
      summary.existingContactsMatched += 1;
      summary.matchedBy.contact[contactMatch.matchedBy] += 1;

      if (contactMatch.alreadyLinkedToHealthSystem) {
        summary.existingContactsAlreadyLinkedToMatchedHealthSystem += 1;
      } else {
        summary.existingContactsNeedingNewHealthSystemLink += 1;
      }

      const existingContact = contactIndexes.byId.get(contactMatch.contactId);
      if (existingContact) {
        if (!existingContact.email && row.email) enrichment.matchedContactsMissingEmail += 1;
        if (!existingContact.title && row.title) enrichment.matchedContactsMissingTitle += 1;
        if (!existingContact.linkedinUrl && row.linkedinUrl) enrichment.matchedContactsMissingLinkedin += 1;
      }

      if (contactMatch.alreadyLinkedToHealthSystem) {
        const existingLink = linkByContactAndHealthSystem.get(`${contactMatch.contactId}|${healthSystemMatch.healthSystemId}`);
        if (existingLink) {
          if (!cleanCell(existingLink.title) && row.title) enrichment.matchedHealthSystemLinksMissingTitle += 1;
          if (!existingLink.isKeyAllianceContact && row.isKeyAllianceContact) {
            enrichment.matchedHealthSystemLinksMissingKeyFlag += 1;
          }
          if (!existingLink.isInformedAllianceContact && row.isInformedAllianceContact) {
            enrichment.matchedHealthSystemLinksMissingInformedFlag += 1;
          }
        }
      }
    } else if (contactMatch.status === "ambiguous") {
      summary.contactAmbiguousRows += 1;
      ambiguousContacts.push({
        rowNumber: row.rowNumber,
        organization: row.organization,
        name: row.name,
        email: row.email,
        matchedBy: contactMatch.matchedBy,
        candidateCount: contactMatch.candidateIds.length
      });
    } else {
      summary.contactUnmatchedRows += 1;
      summary.newContactsWouldBeCreated += 1;
    }
  }

  printJson("summary", summary);
  printJson(
    "top_unmatched_organizations",
    [...unresolvedOrganizations.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 25)
      .map(([organization, rowCount]) => ({ organization, rowCount }))
  );
  printJson(
    "ambiguous_health_systems",
    [...ambiguousOrganizations.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 25)
      .map(([organization, candidates]) => ({ organization, candidates }))
  );
  printJson("ambiguous_contacts", ambiguousContacts.slice(0, 25));
  printJson("enrichment_opportunities", enrichment);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
