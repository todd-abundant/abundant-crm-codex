#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SPREADSHEET_PATH_DEFAULT = path.join(
  process.env.HOME || "",
  "Downloads",
  "Venture Studio Pipeline - 2025 - 2026-2026-03-11-12-26-24.xlsx"
);

const args = process.argv.slice(2);

function getFlag(name) {
  return args.includes(`--${name}`);
}

function getValue(name, fallback = null) {
  const flag = `--${name}=`;
  for (const arg of args) {
    if (arg === `--${name}`) {
      const next = args[args.indexOf(arg) + 1];
      if (next && !next.startsWith("--")) return next;
      return "";
    }
    if (arg.startsWith(flag)) return arg.slice(flag.length);
  }
  return fallback;
}

function getPositionalArg() {
  return args.find((arg) => !arg.startsWith("--")) || null;
}

const INPUT_PATH = getPositionalArg() || getValue("file") || SPREADSHEET_PATH_DEFAULT;
const APPLY = getFlag("apply");
const CREATE_CO_INVESTORS = !getFlag("no-create-co-investors");
const PARSE_ONLY = getFlag("parse-only");

const RAW_STAGE_NORMALIZERS = [
  { match: /screening in active screening/i, value: "SCREENING_IN_ACTIVE_SCREENING" },
  { match: /screening complete passed/i, value: "SCREENING_COMPLETE_PASSED" },
  { match: /screening complete failed/i, value: "SCREENING_COMPLETE_FAILED" },
  { match: /^received$/i, value: "RECEIVED" },
  { match: /^intro call$/i, value: "INTRO_CALL" },
  { match: /intake assessment/i, value: "INTAKE_ASSESSMENT" },
  { match: /^proposal$/i, value: "PROPOSAL" },
  { match: /revisit later/i, value: "REVISIT_LATER" },
  { match: /closed out/i, value: "CLOSED_OUT" }
];

const OPPORTUNITY_STAGE_BY_SPREADSHEET_STAGE = {
  SCREENING_IN_ACTIVE_SCREENING: "QUALIFICATION",
  SCREENING_COMPLETE_PASSED: "PROPOSAL",
  SCREENING_COMPLETE_FAILED: "CLOSED_LOST",
  RECEIVED: "IDENTIFIED",
  INTRO_CALL: "QUALIFICATION",
  INTAKE_ASSESSMENT: "PROPOSAL",
  PROPOSAL: "PROPOSAL",
  REVISIT_LATER: "ON_HOLD",
  CLOSED_OUT: "CLOSED_LOST",
  UNKNOWN: "QUALIFICATION"
};

const PIPELINE_PHASE_BY_SPREADSHEET_STAGE = {
  SCREENING_IN_ACTIVE_SCREENING: "SCREENING",
  SCREENING_COMPLETE_PASSED: "SCREENING",
  SCREENING_COMPLETE_FAILED: "DECLINED",
  RECEIVED: "INTAKE",
  INTRO_CALL: "INTAKE",
  INTAKE_ASSESSMENT: "INTAKE",
  PROPOSAL: "VENTURE_STUDIO_NEGOTIATION",
  REVISIT_LATER: "INTAKE",
  CLOSED_OUT: "DECLINED",
  UNKNOWN: "SCREENING"
};

const PIPELINE_INTAKE_STAGE_BY_SPREADSHEET_STAGE = {
  SCREENING_IN_ACTIVE_SCREENING: "ACTIVE_INTAKE",
  SCREENING_COMPLETE_PASSED: "ACTIVE_INTAKE",
  SCREENING_COMPLETE_FAILED: "ACTIVE_INTAKE",
  RECEIVED: "RECEIVED",
  INTRO_CALL: "INTRO_CALLS",
  INTAKE_ASSESSMENT: "ACTIVE_INTAKE",
  PROPOSAL: "MANAGEMENT_PRESENTATION",
  REVISIT_LATER: "ACTIVE_INTAKE",
  CLOSED_OUT: "ACTIVE_INTAKE",
  UNKNOWN: "ACTIVE_INTAKE"
};

const PIPELINE_INTAKE_DECISION_BY_PHASE = {
  DECLINED: "DECLINE",
  SCREENING: "ADVANCE_TO_NEGOTIATION",
  VENTURE_STUDIO_NEGOTIATION: "ADVANCE_TO_NEGOTIATION",
  INTAKE: "ADVANCE_TO_NEGOTIATION",
  CLOSED: "DECLINE",
  LOI_COLLECTION: "ADVANCE_TO_NEGOTIATION",
  COMMERCIAL_NEGOTIATION: "ADVANCE_TO_NEGOTIATION",
  PORTFOLIO_GROWTH: "ADVANCE_TO_NEGOTIATION"
};

const PIPELINE_INTAKE_DECISION_BY_SPREADSHEET_STAGE = {
  REVISIT_LATER: "REVISIT_LATER"
};

const PIPELINE_CATEGORY_BY_SPREADSHEET_STAGE = {
  REVISIT_LATER: "RE_ENGAGE_LATER",
  UNKNOWN: "ACTIVE"
};

const CLOSED_OUTCOME_BY_STAGE = {
  CLOSED_LOST: "LOST",
  CLOSED_WON: "INVESTED"
};

const HEALTH_SYSTEM_ALIAS_MAP = new Map(
  Object.entries({
    "Ochnser": "Ochsner Health System",
    "Ochsner Health": "Ochsner Health System",
    "Nemours": "Nemours Children's Health",
    "MedStar Health": "MedStar Health, Inc.",
    "MUSC Health": "MUSC Health (Medical Univ. of SC)",
    "Valley Children's": "Valley Children's Healthcare",
    "Lurie Children's": "Ann & Robert H. Lurie Children's Hospital of Chicago",
    "OSF HealthCare": "OSF Healthcare System",
    "UPMC": "Univ. of Pittsburgh Medical Center",
    "Henry Ford": "Henry Ford Health",
    "UChicago Medicine": "University of Chicago",
    "University of Chicago": "University of Chicago",
    "Christiana Care": "Christiana Care Health Services, Inc.",
    "Wellspan": "WellSpan Health",
    "Kaiser Permanente": "Kaiser Foundation Health Plan, Inc.",
    "Mount Sinai": "Mount Sinai Health System",
    "Northwell": "Northwell Health, Inc.",
    "Confluence": "Confluence Health",
    "RUSH": "Rush University System for Health"
  }).map(([from, to]) => [normalizeText(from), normalizeText(to)])
);

const CO_INVESTOR_INDICATOR_KEYWORDS = [
  /\bcapital\b/i,
  /\binvest/i,
  /\bpartners?\b/i,
  /\bpartner\b/i,
  /\bventures?\b/i,
  /\bfund\b/i,
  /\bllc\b/i,
  /\bltd\b/i,
  /\blp\b/i,
  /\bco\.?mpany\b/i,
  /\bgroup\b/i,
  /\bholdings\b/i,
  /\bcorporation\b/i,
  /\binc\.?\b/i,
  /\benterprise\b/i
];

const PEOPLE_NAME_PATTERN = /^[A-Za-z][A-Za-z-.'`]+(?:\s+[A-Za-z][A-Za-z-.'`]+)+$/;

const REPORT = {
  mode: APPLY ? "apply" : "dry-run",
  inputPath: INPUT_PATH,
  parsedRows: 0,
  skippedBlankRows: 0,
  skippedHeaderRows: 0,
  skippedSubtotalRows: 0,
  skippedUnknownStageRows: 0,
  parsedOpportunities: 0,
  existingCompaniesMatched: 0,
  companiesSkippedExistingNoTouch: 0,
  newCompaniesCreated: 0,
  companiesSkippedProtected: 0,
  companiesSkippedNoName: 0,
  opportunitiesCreated: 0,
  opportunitiesUpdated: 0,
  opportunitiesSkippedNoChange: 0,
  pipelinesCreated: 0,
  pipelinesUpdated: 0,
  coInvestorsCreated: 0,
  coInvestorLinksCreated: 0,
  unmatchedHealthSystems: [],
  matchedHealthSystems: [],
  unmatchedOwners: [],
  unmatchedOtherAccounts: [],
  unmappedOwners: [],
  unknownStages: [],
  parseErrors: []
};

const PROTECTED_NO_CREATE_COMPANY_NAMES = new Set(
  ["Laminar Health", "Laminar", "SpendRule", "Spend Rule"].map((value) => normalizeText(value))
);

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeText(value) {
  return (value || "")
    .toString()
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  }

function normalizeLooseText(value) {
  return normalizeText(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|and|hospital|health|system|inc|incorporated|corporation|company|llc|ltd|group|partners?|fund|capital)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCellDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[^0-9])/);
  if (iso) {
    const parsed = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const excelSerial = Number(trimmed);
  if (Number.isFinite(excelSerial) && excelSerial > 1000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + excelSerial * 24 * 60 * 60 * 1000);
    return Number.isNaN(utc.getTime()) ? null : utc;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([A-Za-z0-9_:.]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function colToIndex(cellRef) {
  let value = 0;
  for (const ch of cellRef) {
    value = value * 26 + (ch.charCodeAt(0) - 64);
  }
  return value;
}

function parseCellRef(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  return { col: colToIndex(match[1]), row: Number(match[2]) };
}

function parseSharedStrings(sharedStringsXml) {
  const values = [];
  for (const match of sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const inner = match[1];
    let text = "";
    for (const segment of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      text += decodeXml(segment[1]);
    }
    values.push(text.replace(/_x000D_/g, "\r").trim());
  }
  return values;
}

function parseCellValue(cellTag, sharedStrings) {
  if (cellTag.trim().endsWith("/>")) {
    return "";
  }
  const close = cellTag.indexOf(">");
  const attrs = parseAttributes(cellTag.slice(0, close + 1));
  const body = cellTag.slice(close + 1, -4);
  const type = attrs.t;
  const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  const rawValue = (vMatch && vMatch[1]) || "";

  if (type === "s") {
    const index = Number(rawValue);
    if (Number.isFinite(index) && index >= 0 && index < sharedStrings.length) {
      return sharedStrings[index];
    }
    return "";
  }

  if (type === "inlineStr") {
    const inlineMatch = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
    if (!inlineMatch) return "";
    const tMatch = inlineMatch[1].match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
    return decodeXml((tMatch && tMatch[1]) || "").replace(/\r?\n/g, "\n").trim();
  }

  return decodeXml(rawValue).replace(/\r?\n/g, "\n").trim();
}

function parseRowsFromSheet(sheetXml, sharedStrings) {
  const sheetDataMatch = sheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
  if (!sheetDataMatch) return [];

  const rowsXml = sheetDataMatch[1];
  const rows = [];
  for (const match of rowsXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = parseAttributes(`<row${match[1]}>`);
    const rowNum = Number(rowAttrs.r || "0");
    const rowBody = match[2];
    const cells = new Map();

    for (const cellMatch of rowBody.matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const cellTag = cellMatch[0];
      const close = cellTag.indexOf(">");
      const cellAttrs = parseAttributes(cellTag.slice(0, close + 1));
      if (!cellAttrs.r) continue;
      const loc = parseCellRef(cellAttrs.r);
      if (!loc) continue;
      const value = parseCellValue(cellTag, sharedStrings);
      cells.set(loc.col, value);
    }

    rows.push({ rowNum, cells });
  }

  return rows;
}

function getWorksheetXml(filePath, workbookName = null) {
  const runUnzip = (relPath) => {
    try {
      return execSync(`unzip -p ${JSON.stringify(filePath)} ${JSON.stringify(relPath)}`, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 100
      });
    } catch (error) {
      throw new Error(`Failed to read ${relPath} from ${filePath}. Is unzip installed and file readable?`);
    }
  };

  const workbookXml = runUnzip("xl/workbook.xml");
  const relXml = runUnzip("xl/_rels/workbook.xml.rels");
  const relById = new Map();
  for (const rel of relXml.matchAll(/<Relationship\b([^>]*)>/g)) {
    const attrs = parseAttributes(rel[0]);
    if (attrs.Id && attrs.Target) {
      relById.set(attrs.Id, attrs.Target);
    }
  }

  let target = null;
  let firstTarget = null;
  for (const sheet of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const attrs = parseAttributes(sheet[0]);
    const relationshipId = attrs["r:id"] || attrs["r:id".replace(":", ":")] || attrs["r:id="];
    if (!relationshipId) continue;
    const sheetTarget = relById.get(relationshipId);
    if (!sheetTarget) continue;
    const fullTarget = `xl/${sheetTarget}`;
    if (!firstTarget) firstTarget = fullTarget;
    if (workbookName && attrs.name === workbookName) {
      target = fullTarget;
      break;
    }
    if (!target && attrs.name && /venture studio pipeline/i.test(attrs.name)) {
      target = fullTarget;
      break;
    }
  }

  if (!target) target = firstTarget;
  if (!target) throw new Error("Could not locate sheet XML in workbook.");

  let sharedStringsXml = "";
  try {
    sharedStringsXml = runUnzip("xl/sharedStrings.xml");
  } catch {
    sharedStringsXml = "";
  }
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const sheetXml = runUnzip(target);

  return parseRowsFromSheet(sheetXml, sharedStrings);
}

function detectHeaderIndices(row) {
  const candidates = {
    stage: null,
    opportunityName: null,
    opportunitySubtype: null,
    description: null,
    otherAccount: null,
    healthSystem: null,
    nextMeetingDate: null,
    nextMeetingNotes: null,
    owner: null,
    createdDate: null,
    closeDate: null
  };

  for (const [col, value] of row.cells.entries()) {
    const norm = normalizeText(value).replace(/[_-]+/g, " ");
    if (norm.includes("stage")) candidates.stage = candidates.stage ?? col;
    else if (norm === "opportunity name") candidates.opportunityName = col;
    else if (norm === "opportunity subtype") candidates.opportunitySubtype = col;
    else if (norm === "description") candidates.description = col;
    else if (norm === "other account") candidates.otherAccount = col;
    else if (norm === "health system") candidates.healthSystem = col;
    else if (norm === "next meeting date") candidates.nextMeetingDate = col;
    else if (norm === "next meeting notes") candidates.nextMeetingNotes = col;
    else if (norm === "opportunity owner") candidates.owner = col;
    else if (norm === "created date") candidates.createdDate = col;
    else if (norm === "close date") candidates.closeDate = col;
  }

  if (!candidates.opportunityName) {
    candidates.opportunityName = 4;
    candidates.opportunitySubtype = 5;
    candidates.description = 6;
    candidates.otherAccount = 7;
    candidates.healthSystem = 8;
    candidates.nextMeetingDate = 9;
    candidates.nextMeetingNotes = 10;
    candidates.owner = 11;
    candidates.createdDate = 12;
    candidates.closeDate = 13;
    candidates.stage = 2;
  }

  return candidates;
}

function canonicalizeSpreadsheetStage(raw) {
  if (!raw) return "UNKNOWN";
  for (const entry of RAW_STAGE_NORMALIZERS) {
    if (entry.match.test(raw)) return entry.value;
  }
  return "UNKNOWN";
}

function cleanText(value) {
  return (value || "").toString().trim();
}

function mapOpportunityTypeFromSubtype(subtype) {
  const normalized = normalizeText(subtype);
  if (normalized.includes("spin")) return "SPIN_OUT";
  if (normalized.includes("denovo") || normalized.includes("de-novo")) return "DENOVO";
  return "STARTUP";
}

function isUncertainHeader(value) {
  return !value || /^\s*$/.test(value);
}

function isSummaryStageLabel(value) {
  return /^(subtotal|total)$/i.test(cleanText(value));
}

function isSummaryRow(row, header, stageRaw, opportunityName) {
  const normalizedName = normalizeText(opportunityName);
  const priorCellLabel = cleanText(row.cells.get((header.opportunityName || 0) - 1));
  if (isSummaryStageLabel(stageRaw)) return true;
  if (normalizedName === "count" || normalizedName === "total") return true;
  if (/^\d+$/.test(opportunityName || "") && /^(count|total)$/i.test(priorCellLabel)) return true;
  return false;
}

function parseXlsxPipelineRows(filePath) {
  const rows = getWorksheetXml(filePath);
  if (!rows.length) {
    throw new Error("Worksheet rows not found in spreadsheet.");
  }

  let headerRow = null;
  for (const row of rows) {
    const values = Array.from(row.cells.entries()).map(([col, value]) => [col, value]);
    const hasHeader = values.some(([, value]) => normalizeText(value) === "opportunity name");
    if (hasHeader) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) throw new Error("Header row not found. Expected 'Opportunity Name' column.");

  const header = detectHeaderIndices(headerRow);
  const parsedRows = [];
  let currentStage = null;

  for (const row of rows) {
    if (row.rowNum <= headerRow.rowNum) {
      REPORT.skippedHeaderRows += 1;
      continue;
    }

    const opportunityName = cleanText(row.cells.get(header.opportunityName));
    const stageRaw = cleanText(row.cells.get(header.stage));
    const summaryRow = isSummaryRow(row, header, stageRaw, opportunityName);
    let stage = stageRaw ? canonicalizeSpreadsheetStage(stageRaw) : null;
    if (stage && !summaryRow) currentStage = stage;

    if (summaryRow) {
      REPORT.skippedSubtotalRows += 1;
      continue;
    }

    if (isUncertainHeader(opportunityName)) {
      if (stageRaw) {
        if (!summaryRow && stage !== "UNKNOWN") {
          REPORT.unmatchedOwners.push(`Stage line-only row ${row.rowNum}: ${stageRaw}`);
        } else {
          REPORT.skippedSubtotalRows += 1;
        }
      }
      continue;
    }

    const effectiveStage = stage || currentStage || "UNKNOWN";
    if (!stage && !currentStage) {
      REPORT.skippedUnknownStageRows += 1;
      if (!REPORT.unknownStages.includes(`row ${row.rowNum}`)) {
        REPORT.unknownStages.push(`row ${row.rowNum}`);
      }
    }

    const companyType = mapOpportunityTypeFromSubtype(row.cells.get(header.opportunitySubtype));
    const createdAt = parseCellDate(row.cells.get(header.createdDate));
    const closeDate = parseCellDate(row.cells.get(header.closeDate));
    const nextMeetingDate = parseCellDate(row.cells.get(header.nextMeetingDate));

    parsedRows.push({
      rowNum: row.rowNum,
      spreadsheetStage: effectiveStage,
      rawSpreadsheetStage: stageRaw,
      companyName: opportunityName,
      companyType,
      subtype: cleanText(row.cells.get(header.opportunitySubtype)),
      description: cleanText(row.cells.get(header.description)),
      otherAccount: cleanText(row.cells.get(header.otherAccount)),
      healthSystemRaw: cleanText(row.cells.get(header.healthSystem)),
      nextMeetingDate,
      nextMeetingNotes: cleanText(row.cells.get(header.nextMeetingNotes)),
      ownerRaw: cleanText(row.cells.get(header.owner)),
      createdAt,
      closeDate
    });
    REPORT.parsedRows += 1;
  }

  REPORT.parsedOpportunities = parsedRows.length;
  return parsedRows;
}

function parseCsvRows(filePath) {
  const text = readFileSync(filePath, "utf8");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
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

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headerRow = [], ...dataRows] = rows;
  const headers = headerRow.map((value) => cleanText(value).toLowerCase());
  const headerIndex = {
    opportunityName: headers.indexOf("opportunity name"),
    opportunitySubtype: headers.indexOf("opportunity subtype"),
    description: headers.indexOf("description"),
    otherAccount: headers.indexOf("other account"),
    healthSystem: headers.indexOf("health system"),
    nextMeetingDate: headers.indexOf("next meeting date"),
    nextMeetingNotes: headers.indexOf("next meeting notes"),
    owner: headers.indexOf("opportunity owner"),
    stage: headers.indexOf("stage"),
    createdDate: headers.indexOf("created date"),
    closeDate: headers.indexOf("close date")
  };

  const parsed = [];
  for (const [index, rowData] of dataRows.entries()) {
    const get = (ix) => cleanText(rowData[ix] || "");
    if (!get(headerIndex.opportunityName)) {
      REPORT.skippedBlankRows += 1;
      continue;
    }
    const stage = get(headerIndex.stage) || "UNKNOWN";
    const canonical = canonicalizeSpreadsheetStage(stage);
    parsed.push({
      rowNum: index + 2,
      spreadsheetStage: canonical,
      rawSpreadsheetStage: stage,
      companyName: get(headerIndex.opportunityName),
      companyType: mapOpportunityTypeFromSubtype(get(headerIndex.opportunitySubtype)),
      subtype: get(headerIndex.opportunitySubtype),
      description: get(headerIndex.description),
      otherAccount: get(headerIndex.otherAccount),
      healthSystemRaw: get(headerIndex.healthSystem),
      nextMeetingDate: parseCellDate(get(headerIndex.nextMeetingDate)),
      nextMeetingNotes: get(headerIndex.nextMeetingNotes),
      ownerRaw: get(headerIndex.owner),
      createdAt: parseCellDate(get(headerIndex.createdDate)),
      closeDate: parseCellDate(get(headerIndex.closeDate))
    });
  }
  REPORT.parsedRows = parsed.length;
  REPORT.parsedOpportunities = parsed.length;
  return parsed;
}

function isCoInvestorCandidate(value) {
  if (!value) return false;
  if (!PEOPLE_NAME_PATTERN.test(value) && value.includes(" ")) return true;
  if (CO_INVESTOR_INDICATOR_KEYWORDS.some((regex) => regex.test(value))) return true;
  if (value.includes(",")) return true;
  return false;
}

function buildNormalizedLookup(records, keySelector) {
  const byExact = new Map();
  const byLoose = new Map();
  for (const entry of records) {
    const exact = keySelector(entry);
    if (exact) {
      const key = normalizeText(exact);
      const existing = byExact.get(key) || [];
      existing.push(entry);
      byExact.set(key, existing);
    }
    const loose = normalizeLooseText(exact);
    if (loose) {
      const existing = byLoose.get(loose) || [];
      existing.push(entry);
      byLoose.set(loose, existing);
    }
  }
  return { byExact, byLoose };
}

function resolveByLookup(value, lookup, aliasMap = new Map()) {
  const exact = normalizeText(value);
  const loose = normalizeLooseText(value);
  const aliasTarget = aliasMap.get(exact) || aliasMap.get(loose);
  const search = aliasTarget || exact;
  if (!search) return { result: null, ambiguous: false };

  let candidates = lookup.byExact.get(search) || [];
  if (candidates.length === 1) return { result: candidates[0], ambiguous: false };
  if (candidates.length > 1) return { result: null, ambiguous: true };

  candidates = lookup.byLoose.get(search) || [];
  if (candidates.length === 1) return { result: candidates[0], ambiguous: false };
  if (candidates.length > 1) return { result: null, ambiguous: true };
  return { result: null, ambiguous: false };
}

function resolveOwner(ownerRaw, userLookupByExact, userLookupByLoose) {
  if (!ownerRaw) return null;
  const exact = normalizeText(ownerRaw);
  if (userLookupByExact.get(exact)?.length) {
    return userLookupByExact.get(exact)[0];
  }
  const loose = normalizeLooseText(ownerRaw);
  if (userLookupByLoose.get(loose)?.length) {
    return userLookupByLoose.get(loose)[0];
  }
  return null;
}

function buildOwnerMatchReports(ownerRaw, resolved) {
  if (ownerRaw && !resolved) {
    if (!REPORT.unmatchedOwners.includes(ownerRaw)) {
      REPORT.unmatchedOwners.push(ownerRaw);
    }
  }
}

function buildLeadSourceReports(healthSystemRaw, healthMatch, otherAccount) {
  if (healthMatch.result) {
    REPORT.matchedHealthSystems.push(`${healthSystemRaw} -> ${healthMatch.result.name}`);
  } else if (healthSystemRaw) {
    REPORT.unmatchedHealthSystems.push(healthSystemRaw);
  } else if (otherAccount) {
    if (!REPORT.unmatchedOtherAccounts.includes(otherAccount)) {
      REPORT.unmatchedOtherAccounts.push(otherAccount);
    }
  }
}

function buildInsensitiveNameFilters(values, fieldName) {
  const normalized = [...new Set(values.filter(Boolean))];
  return normalized.map((value) => ({ [fieldName]: { equals: value, mode: "insensitive" } }));
}

async function createOrUpdateCoInvestor(tx, coInvestorRaw, coInvestorsLookup, companyId) {
  const byNameExact = coInvestorsLookup.byExact;
  const byNameLoose = coInvestorsLookup.byLoose;
  const existing = byNameExact.get(normalizeText(coInvestorRaw));
  const exact = existing?.[0] || byNameLoose.get(normalizeLooseText(coInvestorRaw))?.[0];

  let coInvestorId = exact?.id;
  if (!coInvestorId) {
    const created = await tx.coInvestor.create({
      data: {
        name: coInvestorRaw
      },
      select: { id: true }
    });
    coInvestorId = created.id;
    REPORT.coInvestorsCreated += 1;
    coInvestorsLookup.byExact.set(normalizeText(coInvestorRaw), [{ id: created.id, name: coInvestorRaw }]);
    coInvestorsLookup.byLoose.set(normalizeLooseText(coInvestorRaw), [{ id: created.id, name: coInvestorRaw }]);
  }

  const existingLink = await tx.companyCoInvestorLink.findFirst({
    where: { companyId, coInvestorId }
  });
  if (!existingLink) {
    await tx.companyCoInvestorLink.create({
      data: {
        companyId,
        coInvestorId,
        relationshipType: "INVESTOR",
        notes: `Added from spreadsheet import (row source).`
      }
    });
    REPORT.coInvestorLinksCreated += 1;
  }
}

function mapRowToRecords(row) {
  const opportunityStage = OPPORTUNITY_STAGE_BY_SPREADSHEET_STAGE[row.spreadsheetStage] || "QUALIFICATION";
  const pipelinePhase = PIPELINE_PHASE_BY_SPREADSHEET_STAGE[row.spreadsheetStage] || "SCREENING";
  const pipelineIntakeStage = PIPELINE_INTAKE_STAGE_BY_SPREADSHEET_STAGE[row.spreadsheetStage] || "ACTIVE_INTAKE";
  const intakeDecision =
    PIPELINE_INTAKE_DECISION_BY_SPREADSHEET_STAGE[row.spreadsheetStage] ||
    PIPELINE_INTAKE_DECISION_BY_PHASE[pipelinePhase] ||
    "ADVANCE_TO_NEGOTIATION";
  const pipelineCategory = PIPELINE_CATEGORY_BY_SPREADSHEET_STAGE[row.spreadsheetStage] || "ACTIVE";
  const closedReasonFromStage = opportunityStage === "CLOSED_LOST" ? "Closed in source spreadsheet" : null;

  const closeAt = row.closeDate || null;
  const estimatedCloseDate = row.closeDate || null;

  return {
    opportunity: {
      title: row.companyName,
      type: "VENTURE_STUDIO_SERVICES",
      stage: opportunityStage,
      likelihoodPercent: null,
      notes: row.description || null,
      nextSteps: row.nextMeetingNotes || null,
      closeReason: opportunityStage.startsWith("CLOSED") ? row.nextMeetingNotes || closedReasonFromStage : null,
      estimatedCloseDate,
      createdAt: row.createdAt || null,
      closedAt: opportunityStage.startsWith("CLOSED") ? closeAt : null,
      healthSystemId: null
    },
    pipeline: {
      phase: pipelinePhase,
      category: pipelineCategory,
      intakeStage: pipelineIntakeStage,
      intakeDecision,
      intakeDecisionAt: (row.closeDate || row.createdAt || null),
      nextStepDueAt: row.nextMeetingDate || null,
      ownerName: row.ownerRaw || null,
      lastMeaningfulActivityAt: row.closeDate || row.createdAt || row.nextMeetingDate || new Date(),
      closedOutcome: opportunityStage === "CLOSED_LOST" ? CLOSED_OUTCOME_BY_STAGE.CLOSED_LOST : null,
      nextStep: row.nextMeetingNotes || null
    },
    company: {
      type: row.companyType,
      leadSourceType: null,
      leadSourceHealthSystemId: null,
      leadSourceOther: row.otherAccount || null,
      description: row.description || null,
      createdAt: row.createdAt || null
    }
  };
}

function buildSummaryLine() {
  console.log("\n=== Venture Studio pipeline import summary ===");
  console.log(`Mode: ${REPORT.mode}`);
  console.log(`Create co-investors: ${CREATE_CO_INVESTORS ? "yes" : "no"}`);
  console.log(`Input: ${REPORT.inputPath}`);
  console.log(`Parsed opportunity rows: ${REPORT.parsedOpportunities}`);
  console.log(`Skipped header/blank/subtotal: ${REPORT.skippedHeaderRows}/${REPORT.skippedBlankRows}/${REPORT.skippedSubtotalRows}`);
  console.log(`Parsed records: ${REPORT.parsedRows}`);
  console.log(`Companies matched/created: ${REPORT.existingCompaniesMatched}/${REPORT.newCompaniesCreated}`);
  console.log(`Companies skipped (existing no-touch): ${REPORT.companiesSkippedExistingNoTouch}`);
  console.log(`Companies skipped (protected no-create): ${REPORT.companiesSkippedProtected}`);
  console.log(`Opportunities created/updated/skipped: ${REPORT.opportunitiesCreated}/${REPORT.opportunitiesUpdated}/${REPORT.opportunitiesSkippedNoChange}`);
  console.log(`Pipelines created/updated: ${REPORT.pipelinesCreated}/${REPORT.pipelinesUpdated}`);
  console.log(`Co-investors created/linked: ${REPORT.coInvestorsCreated}/${REPORT.coInvestorLinksCreated}`);
  console.log(`Matched health systems: ${REPORT.matchedHealthSystems.length}`);
  console.log(`Unmatched health systems: ${REPORT.unmatchedHealthSystems.length}`);
  console.log(`Unmatched owners: ${REPORT.unmatchedOwners.length}`);
  if (REPORT.unmatchedHealthSystems.length) {
    console.log("Unmatched health systems:", [...new Set(REPORT.unmatchedHealthSystems)].join(" | "));
  }
  if (REPORT.unmatchedOwners.length) {
    console.log("Unmatched owners:", [...new Set(REPORT.unmatchedOwners)].join(" | "));
  }
  if (REPORT.unknownStages.length) {
    console.log("Unknown/uncategorized stage rows:", REPORT.unknownStages.join(" | "));
  }
  if (REPORT.parseErrors.length) {
    console.log("Errors:");
    for (const error of REPORT.parseErrors) {
      console.log(` - ${error}`);
    }
  }
}

function buildInitialLookup(records, sourceRecords) {
  const companyLookup = buildNormalizedLookup(records, (entry) => entry.name);
  const healthSystemLookup = buildNormalizedLookup(sourceRecords.healthSystems, (entry) => entry.name);
  const userLookupExact = new Map();
  const userLookupLoose = new Map();
  const coInvestorLookup = buildNormalizedLookup(sourceRecords.coInvestors, (entry) => entry.name);

  for (const [raw, _] of HEALTH_SYSTEM_ALIAS_MAP.entries()) {
    const norm = normalizeText(raw);
    const target = HEALTH_SYSTEM_ALIAS_MAP.get(norm);
    if (!target) continue;
    const resolvedTarget = sourceRecords.healthSystems.find(
      (entry) => normalizeText(entry.name) === target || normalizeText(entry.legalName || "") === target
    );
    if (!resolvedTarget) continue;
    if (!healthSystemLookup.byExact.get(norm)) {
      healthSystemLookup.byExact.set(norm, [resolvedTarget]);
    }
    if (!healthSystemLookup.byLoose.get(normalizeLooseText(raw))) {
      healthSystemLookup.byLoose.set(normalizeLooseText(raw), [resolvedTarget]);
    }
  }

  for (const user of sourceRecords.users) {
    const normalized = normalizeText(user.name || "");
    if (normalized) {
      const existing = userLookupExact.get(normalized) || [];
      existing.push(user);
      userLookupExact.set(normalized, existing);
    }
    const loose = normalizeLooseText(user.name || "");
    if (loose) {
      const existingLoose = userLookupLoose.get(loose) || [];
      existingLoose.push(user);
      userLookupLoose.set(loose, existingLoose);
    }
  }

  return {
    companyLookup,
    healthSystemLookup,
    userLookupExact,
    userLookupLoose,
    coInvestorLookup
  };
}

async function runImport(rows, dataFromDb) {
  const { companyLookup, healthSystemLookup, userLookupExact, userLookupLoose, coInvestorLookup } =
    buildInitialLookup(dataFromDb.companies, {
      healthSystems: dataFromDb.healthSystems,
      users: dataFromDb.users,
      coInvestors: dataFromDb.coInvestors
    });

  for (const row of rows) {
    const mapped = mapRowToRecords(row);
    const ownerMatch = resolveOwner(row.ownerRaw, userLookupExact, userLookupLoose);
    if (ownerMatch) mapped.pipeline.ownerName = ownerMatch.name;
    buildOwnerMatchReports(row.ownerRaw, ownerMatch);

    const healthSystemMatch = row.healthSystemRaw
      ? resolveByLookup(row.healthSystemRaw, healthSystemLookup, HEALTH_SYSTEM_ALIAS_MAP)
      : { result: null, ambiguous: false };

    if (healthSystemMatch.ambiguous) {
      REPORT.unmatchedHealthSystems.push(`${row.healthSystemRaw} (ambiguous match)`);
    }

    if (healthSystemMatch.result) {
      mapped.company.leadSourceType = "HEALTH_SYSTEM";
      mapped.company.leadSourceHealthSystemId = healthSystemMatch.result.id;
      mapped.company.leadSourceOther = null;
      mapped.opportunity.healthSystemId = healthSystemMatch.result.id;
    } else if (row.otherAccount) {
      mapped.company.leadSourceType = "OTHER";
      mapped.company.leadSourceOther = row.otherAccount;
    }
    buildLeadSourceReports(row.healthSystemRaw, healthSystemMatch, row.otherAccount);

    const transactionResult = await prisma.$transaction(async (tx) => {
      const companyNameKey = normalizeText(row.companyName);
      let existingCompany = companyLookup.byExact.get(companyNameKey)?.[0];
      if (!existingCompany) {
        existingCompany = companyLookup.byLoose.get(normalizeLooseText(row.companyName))?.[0];
      }

      let company;
      if (existingCompany) {
        REPORT.existingCompaniesMatched += 1;
        REPORT.companiesSkippedExistingNoTouch += 1;
        return null;
      }
      if (PROTECTED_NO_CREATE_COMPANY_NAMES.has(companyNameKey)) {
        REPORT.companiesSkippedProtected += 1;
        return null;
      }
      company = await tx.company.create({
        data: {
          name: row.companyName,
          companyType: row.companyType,
          description: mapped.company.description || undefined,
          leadSourceType: mapped.company.leadSourceType || "OTHER",
          leadSourceHealthSystemId: mapped.company.leadSourceHealthSystemId || null,
          leadSourceOther: mapped.company.leadSourceOther || null,
          createdAt: mapped.company.createdAt || undefined
        },
        select: { id: true }
      });
      REPORT.newCompaniesCreated += 1;

      const shouldPersistSubOpportunity = mapped.pipeline.phase !== "SCREENING";
      let opportunityId = null;
      if (shouldPersistSubOpportunity) {
        const existingOpportunity = await tx.companyOpportunity.findFirst({
          where: {
            companyId: company.id,
            type: mapped.opportunity.type,
            title: mapped.opportunity.title,
            ...(mapped.opportunity.healthSystemId
              ? { healthSystemId: mapped.opportunity.healthSystemId }
              : { healthSystemId: null })
          }
        });

        if (existingOpportunity) {
          await tx.companyOpportunity.update({
            where: { id: existingOpportunity.id },
            data: {
              stage: mapped.opportunity.stage,
              notes: mapped.opportunity.notes || undefined,
              nextSteps: mapped.opportunity.nextSteps || undefined,
              closeReason: mapped.opportunity.closeReason || null,
              healthSystemId: mapped.opportunity.healthSystemId,
              estimatedCloseDate: mapped.opportunity.estimatedCloseDate,
              closedAt: mapped.opportunity.closedAt || null,
              createdAt: mapped.opportunity.createdAt || undefined
            }
          });
          REPORT.opportunitiesUpdated += 1;
          opportunityId = existingOpportunity.id;
        } else {
          const createdOpportunity = await tx.companyOpportunity.create({
            data: {
              companyId: company.id,
              type: mapped.opportunity.type,
              title: mapped.opportunity.title,
              healthSystemId: mapped.opportunity.healthSystemId,
              stage: mapped.opportunity.stage,
              likelihoodPercent: mapped.opportunity.likelihoodPercent,
              notes: mapped.opportunity.notes || null,
              nextSteps: mapped.opportunity.nextSteps || null,
              closeReason: mapped.opportunity.closeReason,
              estimatedCloseDate: mapped.opportunity.estimatedCloseDate,
              closedAt: mapped.opportunity.closedAt,
              createdAt: mapped.opportunity.createdAt || undefined
            },
            select: { id: true }
          });
          opportunityId = createdOpportunity.id;
          REPORT.opportunitiesCreated += 1;
        }
      }

      const existingPipeline = await tx.companyPipeline.findUnique({
        where: { companyId: company.id }
      });

      if (existingPipeline) {
        await tx.companyPipeline.update({
          where: { companyId: company.id },
          data: {
            phase: mapped.pipeline.phase,
            category: mapped.pipeline.category,
            stageChangedAt: existingPipeline.phase !== mapped.pipeline.phase ? new Date() : undefined,
            intakeStage: mapped.pipeline.intakeStage,
            intakeDecision: mapped.pipeline.intakeDecision,
            intakeDecisionAt: mapped.pipeline.intakeDecisionAt,
            ownerName: mapped.pipeline.ownerName,
            nextStepDueAt: mapped.pipeline.nextStepDueAt,
            nextStep: mapped.pipeline.nextStep,
            lastMeaningfulActivityAt: mapped.pipeline.lastMeaningfulActivityAt,
            closedOutcome: mapped.pipeline.closedOutcome,
            ventureExpectedCloseDate:
              mapped.opportunity.estimatedCloseDate || existingPipeline.ventureExpectedCloseDate
          }
        });
        REPORT.pipelinesUpdated += 1;
      } else {
        await tx.companyPipeline.create({
          data: {
            companyId: company.id,
            phase: mapped.pipeline.phase,
            stageChangedAt: new Date(),
            intakeStage: mapped.pipeline.intakeStage,
            intakeDecision: mapped.pipeline.intakeDecision,
            intakeDecisionAt: mapped.pipeline.intakeDecisionAt,
            ownerName: mapped.pipeline.ownerName,
            nextStepDueAt: mapped.pipeline.nextStepDueAt,
            nextStep: mapped.pipeline.nextStep,
            lastMeaningfulActivityAt: mapped.pipeline.lastMeaningfulActivityAt,
            closedOutcome: mapped.pipeline.closedOutcome,
            ventureExpectedCloseDate: mapped.opportunity.estimatedCloseDate,
            category: mapped.pipeline.category
          }
        });
        REPORT.pipelinesCreated += 1;
      }

      if (
        CREATE_CO_INVESTORS &&
        row.otherAccount &&
        !mapped.company.leadSourceHealthSystemId &&
        isCoInvestorCandidate(row.otherAccount)
      ) {
        await createOrUpdateCoInvestor(tx, row.otherAccount, coInvestorLookup, company.id);
      }

      companyLookup.byExact.set(normalizeText(row.companyName), [{ id: company.id }]);

      return opportunityId;
    });

    if (!transactionResult) REPORT.opportunitiesSkippedNoChange += 1;
  }
}

function isSupportedInput(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  return ext === ".xlsx" || ext === ".csv";
}

async function main() {
  if (!isSupportedInput(INPUT_PATH)) {
    REPORT.parseErrors.push(`Unsupported file extension for ${INPUT_PATH}`);
    buildSummaryLine();
    process.exitCode = 1;
    return;
  }

  const ext = path.extname(INPUT_PATH).toLowerCase();
  let parsedRows;
  try {
    if (ext === ".csv") {
      parsedRows = parseCsvRows(INPUT_PATH);
    } else {
      parsedRows = parseXlsxPipelineRows(INPUT_PATH);
    }
  } catch (error) {
    REPORT.parseErrors.push(String(error?.message || error));
    buildSummaryLine();
    process.exitCode = 1;
    return;
  }

  if (parsedRows.length === 0) {
    REPORT.parseErrors.push("No opportunities found in file.");
    buildSummaryLine();
    process.exitCode = 1;
    return;
  }

  if (PARSE_ONLY) {
    buildSummaryLine();
    return;
  }

  if (!APPLY) {
    buildSummaryLine();
    console.log("\nThis was a dry run. Re-run with --apply to write these changes.");
    return;
  }

  const companyNames = [...new Set(parsedRows.map((row) => normalizeText(row.companyName)))];
  const healthSystemNames = [...new Set(parsedRows.map((row) => normalizeText(row.healthSystemRaw)).filter(Boolean))];
  const ownerNames = [...new Set(parsedRows.map((row) => normalizeText(row.ownerRaw)).filter(Boolean))];
  const coInvestorNames = [...new Set(parsedRows.map((row) => normalizeText(row.otherAccount)).filter(Boolean))];

  const dbHealthSystems = await prisma.healthSystem.findMany({
    select: { id: true, name: true, legalName: true },
    where: {}
  }).catch((error) => {
    throw new Error(`Failed loading health systems: ${error.message}`);
  });

  const dbCompanies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      companyType: true,
      leadSourceType: true,
      leadSourceOther: true,
      leadSourceHealthSystemId: true,
      description: true
    },
    where: companyNames.length ? { OR: buildInsensitiveNameFilters(companyNames, "name") } : {}
  }).catch((error) => {
    throw new Error(`Failed loading companies: ${error.message}`);
  });

  const dbUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    where: ownerNames.length ? { OR: buildInsensitiveNameFilters(ownerNames, "name") } : {}
  }).catch((error) => {
    throw new Error(`Failed loading users: ${error.message}`);
  });

  const dbCoInvestors = await prisma.coInvestor.findMany({
    select: { id: true, name: true },
    where: coInvestorNames.length ? { OR: buildInsensitiveNameFilters(coInvestorNames, "name") } : {}
  }).catch((error) => {
    throw new Error(`Failed loading co-investors: ${error.message}`);
  });

  await runImport(parsedRows, {
    companies: dbCompanies,
    healthSystems: dbHealthSystems,
    users: dbUsers,
    coInvestors: dbCoInvestors
  });

  buildSummaryLine();
  console.log("\nImport complete with --apply.");
}

main()
  .catch((error) => {
    console.error("Import failed:", error);
    REPORT.parseErrors.push(String(error?.message || error));
    buildSummaryLine();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
