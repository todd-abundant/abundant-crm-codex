import {
  marketLandscapeCellKeys,
  normalizeMarketLandscapePayload,
  type MarketLandscapePayload
} from "./market-landscape";

const NOT_PROVIDED = "Not provided";
const NOT_PROVIDED_LINE_BREAKS = "No information has been provided.";
const MAX_RELEVANT_NOTES = 8;
const CRITERIA_TITLE = "Venture Studio Criteria";
const VENTURE_STUDIO_CRITERIA_TEMPLATE: Array<{ category: string; criteria: string }> = [
  { category: "Products & Services", criteria: "Designed to meet the needs of healthcare providers" },
  {
    category: "Value Proposition",
    criteria: "Creates a measurable impact for health systems (i.e., revenue, cost savings, outcomes)"
  },
  { category: "Prioritization", criteria: "Solves a high-priority pain point for health systems" },
  {
    category: "Differentiation",
    criteria: "Avoids direct competition with the core capabilities of major incumbents (i.e., Epic)"
  },
  { category: "Defined Buyer", criteria: "Clear decision-maker at the health system" },
  {
    category: "Implementation",
    criteria: "Implemented with minimal disruption to existing clinical operations and IT resources"
  },
  { category: "Concept Maturity", criteria: "Early proof of concept at 1+ sites has been collected" },
  { category: "Team", criteria: "Relevant industry expertise and/or sales experience" },
  { category: "Market Size", criteria: "Bottoms-up TAM calculation is ~$1B (at least $500M+)" },
  { category: "Regulatory Requirements", criteria: "Meets all applicable regulatory requirements (i.e., FDA)" }
];
const ASSESSMENT_LABELS = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
  grey: "Grey"
} as const;
const ASSESSMENT_SYMBOLS = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
  grey: "⚪"
} as const;
const ASSESSMENT_LEGEND = {
  green: "Company currently meets the Abundant Venture Studio's criteria for S1 investment",
  yellow: "Company has potential to meet our criteria for S1 investment",
  red: "Company is unlikely to meet our criteria for S1 investment",
  grey: "There is insufficient information to make an informed assessment"
} as const;

type VentureStudioAssessment = keyof typeof ASSESSMENT_LABELS;
type VentureStudioCriteria = { category: string; assessment: VentureStudioAssessment; rationale: string };
type VentureStudioCriteriaRenderRow = {
  category: string;
  criteria: string;
  assessment: VentureStudioAssessment;
  rationale: string;
};

type NoteSource = {
  note: string;
  createdAt: string | Date | null;
  createdByName?: string | null;
  createdByUser?: { name: string | null; email: string | null } | null;
};

type ScreeningSummarySource = {
  healthSystemName: string;
  status: string | null;
  statusUpdatedAt: string | Date | null;
  preliminaryInterest?: string | null;
  currentInterest?: string | null;
  memberFeedbackStatus?: string | null;
  relevantFeedback: string | null;
  statusUpdate: string | null;
};

type ScreeningDocumentSource = {
  title: string;
  url: string;
  healthSystemName?: string | null;
};

export type PipelineIntakeReportSource = {
  companyName: string | null;
  leadSourceHealthSystemName?: string | null;
  website: string | null;
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
  description: string | null;
  atAGlanceProblem: string | null;
  atAGlanceSolution: string | null;
  atAGlanceImpact: string | null;
  atAGlanceKeyStrengths: string | null;
  atAGlanceKeyConsiderations: string | null;
  marketLandscape?: MarketLandscapePayload | null;
  ventureStudioCriteria: unknown;
  nextStep: string | null;
  notes: NoteSource[];
  screeningHealthSystemSummaries: ScreeningSummarySource[];
  screeningDocuments: ScreeningDocumentSource[];
};

export type PipelineIntakeReportPayload = Record<string, string>;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(value: string) {
  if (!/[<>]/.test(value)) return value;

  const withBreaks = value
    .replace(/<\s*(strong|b)\s*>/gi, "[[B]]")
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, "[[/B]]")
    .replace(/<\s*(em|i)\b[^>]*>/gi, "[[I]]")
    .replace(/<\s*\/\s*(em|i)\s*>/gi, "[[/I]]")
    .replace(/<\s*sup\b[^>]*>/gi, "[[SUP]]")
    .replace(/<\s*\/\s*sup\s*>/gi, "[[/SUP]]")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<\s*\/div\s*>/gi, "\n")
    .replace(/<\s*div[^>]*>/gi, "")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*\/ul\s*>/gi, "\n")
    .replace(/<\s*\/ol\s*>/gi, "\n");

  return withBreaks.replace(/<[^>]+>/g, "");
}

function normalizeText(value: string | null | undefined) {
  if (!value) return "";

  const text = decodeHtmlEntities(htmlToPlainText(normalizeLineBreaks(value)))
    .replace(/\[\[B\]\]/g, "**")
    .replace(/\[\[\/B\]\]/g, "**");

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function ensureText(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : NOT_PROVIDED;
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function formatDate(value: string | Date | null) {
  if (!value) return NOT_PROVIDED;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return NOT_PROVIDED;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatLocation(source: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  return ensureText(
    [source.headquartersCity, source.headquartersState, source.headquartersCountry]
      .filter(Boolean)
      .join(", ")
  );
}

function sanitizeAssessment(value: unknown): VentureStudioAssessment {
  if (value === "green" || value === "yellow" || value === "red" || value === "grey") return value;
  return "grey";
}

function sanitizeVentureStudioCriteria(raw: unknown): VentureStudioCriteria[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const candidate = entry as { category?: unknown; assessment?: unknown; rationale?: unknown };
      const category = typeof candidate.category === "string" ? candidate.category.trim() : "";
      if (!category) return null;
      return {
        category,
        assessment: sanitizeAssessment(candidate.assessment),
        rationale:
          typeof candidate.rationale === "string" ? candidate.rationale.trim() : ""
      };
    })
    .filter((entry): entry is VentureStudioCriteria => Boolean(entry));
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "｜").replace(/\n/g, " ").trim();
}

function buildVentureStudioCriteriaRows(raw: unknown): VentureStudioCriteriaRenderRow[] {
  const criteria = sanitizeVentureStudioCriteria(raw);
  const byCategory = new Map(criteria.map((entry) => [entry.category, entry] as const));

  const rows: VentureStudioCriteriaRenderRow[] = VENTURE_STUDIO_CRITERIA_TEMPLATE.map((template) => {
    const saved = byCategory.get(template.category);
    return {
      category: template.category,
      criteria: template.criteria,
      assessment: saved?.assessment || "grey",
      rationale: saved?.rationale || ""
    };
  });

  return rows;
}

function formatVentureStudioCriteriaTable(raw: unknown) {
  const criteria = buildVentureStudioCriteriaRows(raw);
  if (criteria.length === 0) return NOT_PROVIDED;

  const header = "Category | Criteria | Assessment | Rationale";
  const separator = "---------|----------|------------|----------";
  const rows = criteria.map(
    (entry) =>
      `${escapeTableCell(ensureText(entry.category))} | ${escapeTableCell(
        ensureText(entry.criteria)
      )} | ${escapeTableCell(
        ASSESSMENT_SYMBOLS[entry.assessment] || ASSESSMENT_LABELS[entry.assessment]
      )} | ${escapeTableCell(
        formatVentureStudioRationale(entry.rationale)
      )}`
  );

  return [header, separator, ...rows].join("\n");
}

function formatSection(value: string | null) {
  const normalized = ensureText(value);
  if (normalized === NOT_PROVIDED) return NOT_PROVIDED;
  return normalized;
}

function formatNoteSection(notes: NoteSource[]) {
  if (!notes || notes.length === 0) return NOT_PROVIDED_LINE_BREAKS;

  const lines = notes
    .slice(0, MAX_RELEVANT_NOTES)
    .map((entry) => {
      const author =
        ensureText(entry.createdByName) !== NOT_PROVIDED
          ? ensureText(entry.createdByName)
          : entry.createdByUser
            ? ensureText(entry.createdByUser.name || entry.createdByUser.email)
            : NOT_PROVIDED;
      const text = ensureText(entry.note).replace(/[ \t]{2,}/g, " ");
      return `[${formatDate(entry.createdAt)}] ${author}: ${text}`;
    })
    .filter((entry) => entry.length > 0);

  if (lines.length === 0) return NOT_PROVIDED_LINE_BREAKS;
  return lines.join("\n");
}

function formatScreeningSummary(summaries: ScreeningSummarySource[]) {
  if (!summaries || summaries.length === 0) return NOT_PROVIDED_LINE_BREAKS;

  const lines = summaries
    .filter(
      (entry) =>
        Boolean(entry.healthSystemName.trim()) ||
        Boolean(entry.status) ||
        Boolean(entry.preliminaryInterest) ||
        Boolean(entry.currentInterest) ||
        Boolean(entry.memberFeedbackStatus) ||
        Boolean(entry.relevantFeedback) ||
        Boolean(entry.statusUpdate)
    )
    .map((entry) => {
      const status = ensureText(entry.status);
      const latest = [];
      if (entry.statusUpdatedAt) latest.push(`updated ${formatDate(entry.statusUpdatedAt)}`);
      const currentInterest = normalizeText(entry.currentInterest);
      const preliminaryInterest = normalizeText(entry.preliminaryInterest);
      const memberFeedbackStatus = normalizeText(entry.memberFeedbackStatus);
      const lineParts = [
        entry.healthSystemName || "Unknown alliance member",
        `status ${status}`,
        preliminaryInterest ? `preliminary ${preliminaryInterest}` : null,
        currentInterest ? `current ${currentInterest}` : null,
        ...latest,
        memberFeedbackStatus ? `member feedback/status: ${memberFeedbackStatus}` : null,
        entry.relevantFeedback ? `feedback: ${ensureText(entry.relevantFeedback)}` : null,
        entry.statusUpdate ? `status update: ${ensureText(entry.statusUpdate)}` : null
      ].filter(Boolean);
      return `• ${lineParts.join(" | ")}`;
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : NOT_PROVIDED_LINE_BREAKS;
}

function formatScreeningLinks(documents: ScreeningDocumentSource[]) {
  if (!documents || documents.length === 0) return NOT_PROVIDED;

  const seen = new Set<string>();
  const lines = documents
    .filter((entry) => {
      const key = `${entry.title}:${entry.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map((entry) => {
      const label = ensureText(entry.title);
      const system = ensureText(entry.healthSystemName) !== NOT_PROVIDED ? ` (${ensureText(entry.healthSystemName)})` : "";
      return `• ${label}${system}: ${ensureText(entry.url)}`;
    });

  return lines.length > 0 ? lines.join("\n") : NOT_PROVIDED;
}

function formatHealthSystem(source: PipelineIntakeReportSource) {
  const leadSourceName = ensureText(source.leadSourceHealthSystemName);
  if (leadSourceName !== NOT_PROVIDED) return leadSourceName;

  const names = (source.screeningHealthSystemSummaries || [])
    .map((entry) => entry.healthSystemName)
    .filter(Boolean);

  if (names.length === 0) return NOT_PROVIDED;
  const unique = Array.from(new Set(names));
  return unique.join(", ");
}

function clampSentence(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function normalizeSingleLine(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "";
  return text.replace(/\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

function formatVentureStudioRationale(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized || "No rationale provided.";
}

function buildVentureStudioHeadline(source: PipelineIntakeReportSource, companyName: string) {
  const solution = normalizeSingleLine(source.atAGlanceSolution);
  if (solution) return clampSentence(solution, 150);

  const problem = normalizeSingleLine(source.atAGlanceProblem);
  if (problem) return clampSentence(`${companyName}: ${problem}`, 150);

  return `${companyName} Venture Studio Criteria Assessment`;
}

function buildMarketLandscapeTokens(source: PipelineIntakeReportSource, companyName: string) {
  const landscape = normalizeMarketLandscapePayload(source.marketLandscape, companyName);
  const cardByKey = new Map(landscape.cards.map((card) => [card.key, card] as const));
  const isStrengthsTemplate = landscape.template === "STRENGTHS_GAPS";
  const primaryLabel = isStrengthsTemplate ? "Strengths" : "Category Overview";
  const secondaryLabel = isStrengthsTemplate ? "Gaps" : "Business Model";

  const tokens: Record<string, string> = {
    "{{MARKET_LANDSCAPE_SECTION_LABEL}}": ensureText(landscape.sectionLabel),
    "{{MARKET_LANDSCAPE_HEADLINE}}": ensureText(landscape.headline),
    "{{MARKET_LANDSCAPE_SUBHEADLINE}}": ensureText(landscape.subheadline),
    "{{MARKET_LANDSCAPE_TEMPLATE}}": landscape.template,
    "{{MARKET_LANDSCAPE_X_AXIS_LABEL}}": ensureText(landscape.xAxisLabel),
    "{{MARKET_LANDSCAPE_Y_AXIS_LABEL}}": ensureText(landscape.yAxisLabel),
    "{{MARKET_LANDSCAPE_COLUMN_1_LABEL}}": ensureText(landscape.columnLabels[0]),
    "{{MARKET_LANDSCAPE_COLUMN_2_LABEL}}": ensureText(landscape.columnLabels[1]),
    "{{MARKET_LANDSCAPE_ROW_1_LABEL}}": ensureText(landscape.rowLabels[0]),
    "{{MARKET_LANDSCAPE_ROW_2_LABEL}}": ensureText(landscape.rowLabels[1]),
    "{{ML_PRIMARY_LABEL}}": primaryLabel,
    "{{ML_SECONDARY_LABEL}}": secondaryLabel,
    "{{MARKET_LANDSCAPE_SLIDE_MARKER}}": "MARKET_LANDSCAPE_V1"
  };

  for (const cellKey of marketLandscapeCellKeys) {
    const tokenCellKey = cellKey.toUpperCase();
    const card = cardByKey.get(cellKey);
    const primaryBody = isStrengthsTemplate ? card?.strengths : card?.overview;
    const secondaryBody = isStrengthsTemplate ? card?.gaps : card?.businessModel;

    tokens[`{{ML_${tokenCellKey}_TITLE}}`] = ensureText(card?.title);
    tokens[`{{ML_${tokenCellKey}_PRIMARY_BODY}}`] = ensureText(primaryBody);
    tokens[`{{ML_${tokenCellKey}_SECONDARY_BODY}}`] = ensureText(secondaryBody);
    tokens[`{{ML_${tokenCellKey}_OVERVIEW}}`] = ensureText(card?.overview);
    tokens[`{{ML_${tokenCellKey}_BUSINESS_MODEL}}`] = ensureText(card?.businessModel);
    tokens[`{{ML_${tokenCellKey}_STRENGTHS}}`] = ensureText(card?.strengths);
    tokens[`{{ML_${tokenCellKey}_GAPS}}`] = ensureText(card?.gaps);
    tokens[`{{ML_${tokenCellKey}_VENDORS}}`] = ensureText(card?.vendors);
    tokens[`{{ML_${tokenCellKey}_FOCUS}}`] =
      landscape.primaryFocusCellKey === cellKey ? "PRIMARY FOCUS" : "";
  }

  return tokens;
}

export function buildPipelineIntakeReportPayload(source: PipelineIntakeReportSource): PipelineIntakeReportPayload {
  const generatedAt = new Date();
  const companyName = ensureText(source.companyName);
  const reportDate = generatedAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  const problem = formatSection(source.atAGlanceProblem);
  const solution = formatSection(source.atAGlanceSolution);
  const impact = formatSection(source.atAGlanceImpact);
  const strengths = formatSection(source.atAGlanceKeyStrengths);
  const considerations = formatSection(source.atAGlanceKeyConsiderations);

  const notesSection = [
    `Recent notes:\n${formatNoteSection(source.notes || [])}`,
    `Screening summary:\n${formatScreeningSummary(source.screeningHealthSystemSummaries || [])}`
  ].join("\n\n");
  const marketLandscapeTokens = buildMarketLandscapeTokens(source, companyName);
  const ventureCriteriaRows = buildVentureStudioCriteriaRows(source.ventureStudioCriteria);
  const ventureCriteriaRowTokens = Object.fromEntries(
    ventureCriteriaRows.flatMap((row, index) => {
      const tokenIndex = String(index + 1);
      return [
        [`{{VSC_ROW_${tokenIndex}_CATEGORY}}`, ensureText(row.category)],
        [`{{VSC_ROW_${tokenIndex}_CRITERIA}}`, ensureText(row.criteria)],
        [`{{VSC_ROW_${tokenIndex}_ASSESSMENT}}`, ASSESSMENT_SYMBOLS[row.assessment] || "⚪"],
        [`{{VSC_ROW_${tokenIndex}_RATIONALE}}`, formatVentureStudioRationale(row.rationale)]
      ];
    })
  ) as Record<string, string>;

  return {
    "{{COMPANY_NAME}}": companyName,
    "{{REPORT_DATE}}": reportDate,
    "{{WEBSITE}}": ensureText(source.website),
    "{{LOCATION}}": formatLocation(source),
    "{{DESCRIPTION}}": formatSection(source.description),
    "{{PROBLEM}}": problem,
    "{{SOLUTION}}": solution,
    "{{IMPACT}}": impact,
    "{{KEY_STRENGTHS}}": strengths,
    "{{KEY_CONSIDERATIONS}}": considerations,
    "{{VENTURE_STUDIO_CRITERIA}}": formatVentureStudioCriteriaTable(source.ventureStudioCriteria),
    "{{VENTURE STUDIO_CRITERIA}}": formatVentureStudioCriteriaTable(source.ventureStudioCriteria),
    "{{CRITERIA_TITLE}}": CRITERIA_TITLE,
    "{{VSC_HEADLINE}}": buildVentureStudioHeadline(source, companyName),
    "{{VSC_LEGEND_GREEN}}": `${ASSESSMENT_SYMBOLS.green} ${ASSESSMENT_LEGEND.green}`,
    "{{VSC_LEGEND_YELLOW}}": `${ASSESSMENT_SYMBOLS.yellow} ${ASSESSMENT_LEGEND.yellow}`,
    "{{VSC_LEGEND_RED}}": `${ASSESSMENT_SYMBOLS.red} ${ASSESSMENT_LEGEND.red}`,
    "{{VSC_LEGEND_GREY}}": `${ASSESSMENT_SYMBOLS.grey} ${ASSESSMENT_LEGEND.grey}`,
    "{{HEALTH_SYSTEM}}": formatHealthSystem(source),
    "{{MONTH}}": generatedAt.toLocaleDateString(undefined, { month: "long" }),
    "{{YEAR}}": String(generatedAt.getFullYear()),
    "{{NEXT_STEP}}": formatSection(source.nextStep),
    "{{RELEVANT_NOTES}}": normalizeLineBreaks(notesSection),
    "{{SCREENING_LINKS}}":
      source.screeningDocuments && source.screeningDocuments.length > 0
        ? formatScreeningLinks(source.screeningDocuments)
        : NOT_PROVIDED,
    ...marketLandscapeTokens,
    ...ventureCriteriaRowTokens
  };
}
