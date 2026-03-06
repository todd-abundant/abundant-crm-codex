import {
  CompanyDocumentType,
  CompanyReportStatus,
  CompanyReportType,
  type CompanyReport
} from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/db";
import {
  marketLandscapeCellKeys,
  marketLandscapePayloadFromRecord,
  type MarketLandscapePayload
} from "@/lib/market-landscape";
import { parseDateInput } from "@/lib/date-parse";

export type ReportSectionMode = "AUTO" | "OVERRIDE";

export type ReportSectionState = {
  sectionId: string;
  mode: ReportSectionMode;
  isHidden: boolean;
  overrideTitle: string;
  overrideBodyHtml: string;
};

type ReportMetadataInput = {
  title: string;
  subtitle: string | null;
  audienceLabel: string | null;
  confidentialityLabel: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};

type ReportNoteSummary = {
  createdAt: string;
  author: string;
  note: string;
};

type VentureCriteriaRow = {
  category: string;
  assessment: "green" | "yellow" | "red" | "grey";
  rationale: string;
};

type ScreeningHealthSystemSummary = {
  id: string;
  name: string;
  status: "NOT_STARTED" | "PENDING" | "NEGOTIATING" | "SIGNED" | "DECLINED";
  statusUpdatedAt: string | null;
  participantCount: number;
  attendedCount: number;
  relevantFeedback: string | null;
  statusUpdate: string | null;
};

type QuantitativeCategorySummary = {
  category: string;
  averageScore: number | null;
  responseCount: number;
};

type QualitativeThemeSummary = {
  theme: string;
  count: number;
  sentimentBreakdown: {
    positive: number;
    mixed: number;
    neutral: number;
    negative: number;
  };
};

type OpportunitySnapshotRow = {
  id: string;
  title: string;
  type: string;
  stage: string;
  healthSystemName: string | null;
  likelihoodPercent: number | null;
  amountUsd: number | null;
  contractPriceUsd: number | null;
  estimatedCloseDate: string | null;
  nextSteps: string | null;
  updatedAt: string;
};

type BaseReportSnapshot = {
  kind: CompanyReportType;
  companyId: string;
  companyName: string;
  website: string | null;
  location: string;
  description: string | null;
  leadSourceHealthSystemName: string | null;
  phase: string | null;
  nextStep: string | null;
  generatedAt: string;
  notes: ReportNoteSummary[];
};

type IntakeReportSnapshot = BaseReportSnapshot & {
  kind: "INTAKE";
  atAGlanceProblem: string | null;
  atAGlanceSolution: string | null;
  atAGlanceImpact: string | null;
  atAGlanceKeyStrengths: string | null;
  atAGlanceKeyConsiderations: string | null;
  ventureStudioCriteria: VentureCriteriaRow[];
  marketLandscape: MarketLandscapePayload;
};

type ScreeningReportSnapshot = BaseReportSnapshot & {
  kind: "SCREENING";
  targetLoiCount: number;
  screeningWebinarDate1At: string | null;
  screeningWebinarDate2At: string | null;
  allianceHealthSystems: ScreeningHealthSystemSummary[];
  quantitativeSummary: QuantitativeCategorySummary[];
  qualitativeThemes: QualitativeThemeSummary[];
  loiCounts: {
    notStarted: number;
    pending: number;
    negotiating: number;
    signed: number;
    declined: number;
  };
};

type OpportunityReportSnapshot = BaseReportSnapshot & {
  kind: "OPPORTUNITY";
  opportunities: OpportunitySnapshotRow[];
  metrics: {
    openCount: number;
    closedCount: number;
    wonCount: number;
    lostCount: number;
    totalPipelineUsd: number;
    weightedPipelineUsd: number;
    averageLikelihoodPercent: number | null;
  };
  stageCounts: Array<{ stage: string; count: number }>;
  next30Days: OpportunitySnapshotRow[];
  next60Days: OpportunitySnapshotRow[];
  next90Days: OpportunitySnapshotRow[];
};

type CompanyReportSourceSnapshot =
  | IntakeReportSnapshot
  | ScreeningReportSnapshot
  | OpportunityReportSnapshot;

type ReportSectionDefinition = {
  id: string;
  label: string;
  description: string;
  autoTitle: (snapshot: CompanyReportSourceSnapshot) => string;
  autoBodyHtml: (snapshot: CompanyReportSourceSnapshot) => string;
};

type ReportTemplateDefinition = {
  type: CompanyReportType;
  label: string;
  sections: ReportSectionDefinition[];
};

export type CompanyReportSectionView = {
  sectionId: string;
  label: string;
  description: string;
  mode: ReportSectionMode;
  isHidden: boolean;
  overrideTitle: string;
  overrideBodyHtml: string;
  autoTitle: string;
  autoBodyHtml: string;
  resolvedTitle: string;
  resolvedBodyHtml: string;
};

export type CompanyReportDetailView = {
  id: string;
  companyId: string;
  type: CompanyReportType;
  typeLabel: string;
  status: CompanyReportStatus;
  templateVersion: number;
  title: string;
  subtitle: string | null;
  audienceLabel: string | null;
  confidentialityLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  publishedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  sections: CompanyReportSectionView[];
  renderedHtml: string;
};

export class CompanyReportError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "CompanyReportError";
  }
}

const REPORT_TEMPLATE_VERSION = 1;
const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric"
});

const reportTypeLabelByType: Record<CompanyReportType, string> = {
  INTAKE: "Intake Report",
  SCREENING: "Screening Report",
  OPPORTUNITY: "Opportunity Report"
};

const reportDocumentTypeByType: Record<CompanyReportType, CompanyDocumentType> = {
  INTAKE: "INTAKE_REPORT",
  SCREENING: "SCREENING_REPORT",
  OPPORTUNITY: "OPPORTUNITY_REPORT"
};

function decimalToNumber(value: { toString(): string } | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not provided";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not provided";
  return REPORT_DATE_FORMATTER.format(parsed);
}

function formatDateIso(value: Date | null | undefined) {
  if (!value) return null;
  return value.toISOString();
}

function parseOptionalDate(value: string | null | undefined) {
  const parsed = parseDateInput(value);
  return parsed || null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureText(value: string | null | undefined, fallback = "Not provided") {
  const trimmed = (value || "").trim();
  return trimmed || fallback;
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToPlainText(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  return normalized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOverrideHtml(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  return normalized
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "")
    .replace(/ on[a-z]+='[^']*'/gi, "");
}

function multilineParagraphHtml(value: string | null | undefined, fallback = "Not provided") {
  const text = ensureText(htmlToPlainText(value), fallback);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return `<p>${escapeHtml(fallback)}</p>`;
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function listHtml(values: string[], fallback = "Not provided") {
  const rows = values.map((entry) => htmlToPlainText(entry)).map((entry) => entry.trim()).filter(Boolean);
  if (rows.length === 0) return `<p>${escapeHtml(fallback)}</p>`;
  return `<ul>${rows.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`;
}

function currency(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not provided";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not provided";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function statusLabel(status: ScreeningHealthSystemSummary["status"]) {
  if (status === "PENDING") return "Evaluating";
  if (status === "NEGOTIATING") return "Negotiating";
  if (status === "SIGNED") return "Signed";
  if (status === "DECLINED") return "Declined";
  return "Not Started";
}

function statusDotClass(status: ScreeningHealthSystemSummary["status"]) {
  if (status === "SIGNED" || status === "NEGOTIATING") return "green";
  if (status === "PENDING") return "yellow";
  if (status === "DECLINED") return "red";
  return "grey";
}

function tableHtml(headers: string[], rows: string[][]) {
  if (rows.length === 0) return "<p>Not provided</p>";
  const head = headers.map((entry) => `<th>${escapeHtml(entry)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((entry) => `<td>${escapeHtml(entry)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="report-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function formatLocation(source: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  return [source.headquartersCity, source.headquartersState, source.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function sanitizeVentureCriteria(raw: unknown): VentureCriteriaRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: VentureCriteriaRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as { category?: unknown; assessment?: unknown; rationale?: unknown };
    const category = typeof candidate.category === "string" ? candidate.category.trim() : "";
    if (!category) continue;
    const assessment =
      candidate.assessment === "green" ||
      candidate.assessment === "yellow" ||
      candidate.assessment === "red" ||
      candidate.assessment === "grey"
        ? candidate.assessment
        : "grey";
    const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";
    rows.push({
      category,
      assessment,
      rationale
    });
  }
  return rows;
}

function assessmentLabel(value: VentureCriteriaRow["assessment"]) {
  if (value === "green") return "Green";
  if (value === "yellow") return "Yellow";
  if (value === "red") return "Red";
  return "Grey";
}

function loiStatusCounts(rows: ScreeningHealthSystemSummary[]) {
  const counters = {
    notStarted: 0,
    pending: 0,
    negotiating: 0,
    signed: 0,
    declined: 0
  };
  for (const row of rows) {
    if (row.status === "PENDING") counters.pending += 1;
    else if (row.status === "NEGOTIATING") counters.negotiating += 1;
    else if (row.status === "SIGNED") counters.signed += 1;
    else if (row.status === "DECLINED") counters.declined += 1;
    else counters.notStarted += 1;
  }
  return counters;
}

function summarizeQualitativeThemes(
  values: Array<{
    theme: string;
    sentiment: "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
  }>
) {
  const byTheme = new Map<string, QualitativeThemeSummary>();
  for (const row of values) {
    const theme = row.theme.trim() || "General";
    const current = byTheme.get(theme) || {
      theme,
      count: 0,
      sentimentBreakdown: {
        positive: 0,
        mixed: 0,
        neutral: 0,
        negative: 0
      }
    };
    current.count += 1;
    if (row.sentiment === "POSITIVE") current.sentimentBreakdown.positive += 1;
    else if (row.sentiment === "MIXED") current.sentimentBreakdown.mixed += 1;
    else if (row.sentiment === "NEGATIVE") current.sentimentBreakdown.negative += 1;
    else current.sentimentBreakdown.neutral += 1;
    byTheme.set(theme, current);
  }
  return Array.from(byTheme.values()).sort((left, right) => right.count - left.count || left.theme.localeCompare(right.theme));
}

function toSnapshotNotes(
  notes: Array<{
    note: string;
    createdAt: Date;
    createdByName: string | null;
    createdByUser: { name: string | null; email: string | null } | null;
  }>
) {
  return notes
    .slice(0, 12)
    .map((note) => ({
      createdAt: note.createdAt.toISOString(),
      author: note.createdByName || note.createdByUser?.name || note.createdByUser?.email || "Unknown",
      note: htmlToPlainText(note.note)
    }))
    .filter((entry) => entry.note.trim().length > 0);
}

function extractLatestCellText(
  changes: Array<{
    field: "RELEVANT_FEEDBACK" | "STATUS_UPDATE";
    value: string;
    createdAt: Date;
  }>,
  field: "RELEVANT_FEEDBACK" | "STATUS_UPDATE"
) {
  const match = changes.find((entry) => entry.field === field);
  return match ? htmlToPlainText(match.value) : null;
}

async function buildReportSnapshot(
  companyId: string,
  type: CompanyReportType
): Promise<CompanyReportSourceSnapshot> {
  const [company, notes, allianceHealthSystems] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      include: {
        leadSourceHealthSystem: {
          select: { name: true }
        },
        pipeline: true,
        marketLandscape: {
          include: {
            cards: {
              orderBy: [{ sortOrder: "asc" }, { cellKey: "asc" }]
            }
          }
        },
        opportunities: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: {
            healthSystem: {
              select: {
                id: true,
                name: true
              }
            },
            contacts: {
              select: { id: true }
            }
          }
        },
        screeningEvents: {
          include: {
            participants: {
              select: {
                healthSystemId: true,
                attendanceStatus: true
              }
            }
          }
        },
        lois: {
          include: {
            healthSystem: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        screeningCellChanges: {
          orderBy: [{ createdAt: "desc" }],
          select: {
            healthSystemId: true,
            field: true,
            value: true,
            createdAt: true
          }
        },
        screeningQuantitativeFeedback: {
          orderBy: [{ updatedAt: "desc" }],
          select: {
            healthSystemId: true,
            category: true,
            score: true,
            notes: true
          }
        },
        screeningQualitativeFeedback: {
          orderBy: [{ updatedAt: "desc" }],
          select: {
            healthSystemId: true,
            category: true,
            theme: true,
            sentiment: true,
            feedback: true
          }
        }
      }
    }),
    prisma.entityNote.findMany({
      where: {
        entityKind: "COMPANY",
        entityId: companyId
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        note: true,
        createdAt: true,
        createdByName: true,
        createdByUser: {
          select: {
            name: true,
            email: true
          }
        }
      }
    }),
    prisma.healthSystem.findMany({
      where: { isAllianceMember: true },
      select: {
        id: true,
        name: true
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  if (!company) {
    throw new CompanyReportError("Pipeline item not found", 404);
  }

  const baseSnapshot: BaseReportSnapshot = {
    kind: type,
    companyId: company.id,
    companyName: company.name,
    website: company.website,
    location: formatLocation(company),
    description: company.description,
    leadSourceHealthSystemName: company.leadSourceHealthSystem?.name || null,
    phase: company.pipeline?.phase || null,
    nextStep: company.pipeline?.nextStep || null,
    generatedAt: new Date().toISOString(),
    notes: toSnapshotNotes(notes)
  };

  const attendanceBySystemId = new Map<string, { total: number; attended: number }>();
  for (const event of company.screeningEvents) {
    for (const participant of event.participants) {
      const current = attendanceBySystemId.get(participant.healthSystemId) || { total: 0, attended: 0 };
      current.total += 1;
      if (participant.attendanceStatus === "ATTENDED") current.attended += 1;
      attendanceBySystemId.set(participant.healthSystemId, current);
    }
  }

  const changesBySystemId = new Map<string, Array<{ field: "RELEVANT_FEEDBACK" | "STATUS_UPDATE"; value: string; createdAt: Date }>>();
  for (const change of company.screeningCellChanges) {
    const existing = changesBySystemId.get(change.healthSystemId) || [];
    existing.push({
      field: change.field,
      value: change.value,
      createdAt: change.createdAt
    });
    changesBySystemId.set(change.healthSystemId, existing);
  }

  const quantitativeBySystemId = new Map<string, typeof company.screeningQuantitativeFeedback>();
  for (const entry of company.screeningQuantitativeFeedback) {
    const existing = quantitativeBySystemId.get(entry.healthSystemId) || [];
    existing.push(entry);
    quantitativeBySystemId.set(entry.healthSystemId, existing);
  }

  const qualitativeBySystemId = new Map<string, typeof company.screeningQualitativeFeedback>();
  for (const entry of company.screeningQualitativeFeedback) {
    const existing = qualitativeBySystemId.get(entry.healthSystemId) || [];
    existing.push(entry);
    qualitativeBySystemId.set(entry.healthSystemId, existing);
  }

  const loiBySystemId = new Map(company.lois.map((entry) => [entry.healthSystemId, entry] as const));
  const allScreeningSystemIds = new Set<string>(allianceHealthSystems.map((entry) => entry.id));
  for (const entry of company.lois) allScreeningSystemIds.add(entry.healthSystemId);
  for (const entry of company.screeningQuantitativeFeedback) allScreeningSystemIds.add(entry.healthSystemId);
  for (const entry of company.screeningQualitativeFeedback) allScreeningSystemIds.add(entry.healthSystemId);
  for (const event of company.screeningEvents) {
    for (const participant of event.participants) {
      allScreeningSystemIds.add(participant.healthSystemId);
    }
  }

  const screeningSystemNameById = new Map<string, string>();
  for (const entry of allianceHealthSystems) screeningSystemNameById.set(entry.id, entry.name);
  for (const entry of company.lois) screeningSystemNameById.set(entry.healthSystemId, entry.healthSystem.name);

  const allianceSummaries = Array.from(allScreeningSystemIds)
    .map((systemId) => {
      const loi = loiBySystemId.get(systemId);
      const attendance = attendanceBySystemId.get(systemId) || { total: 0, attended: 0 };
      const changes = changesBySystemId.get(systemId) || [];
      const quantitativeRows = quantitativeBySystemId.get(systemId) || [];
      const qualitativeRows = qualitativeBySystemId.get(systemId) || [];
      const relevantFeedback =
        extractLatestCellText(changes, "RELEVANT_FEEDBACK") ||
        htmlToPlainText(qualitativeRows[0]?.feedback) ||
        htmlToPlainText(quantitativeRows[0]?.notes) ||
        null;
      const statusUpdate =
        extractLatestCellText(changes, "STATUS_UPDATE") ||
        htmlToPlainText(loi?.notes) ||
        null;

      return {
        id: systemId,
        name: screeningSystemNameById.get(systemId) || "Alliance Member",
        status: loi?.status || "NOT_STARTED",
        statusUpdatedAt: formatDateIso(loi?.statusUpdatedAt),
        participantCount: attendance.total,
        attendedCount: attendance.attended,
        relevantFeedback,
        statusUpdate
      } satisfies ScreeningHealthSystemSummary;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const quantitativeByCategory = new Map<string, { sum: number; count: number }>();
  for (const entry of company.screeningQuantitativeFeedback) {
    const score = decimalToNumber(entry.score);
    if (score === null || !Number.isFinite(score)) continue;
    const category = ensureText(entry.category, "Uncategorized");
    const existing = quantitativeByCategory.get(category) || { sum: 0, count: 0 };
    existing.sum += score;
    existing.count += 1;
    quantitativeByCategory.set(category, existing);
  }
  const quantitativeSummary = Array.from(quantitativeByCategory.entries())
    .map(([category, totals]) => ({
      category,
      averageScore: totals.count > 0 ? Math.round((totals.sum / totals.count) * 10) / 10 : null,
      responseCount: totals.count
    }))
    .sort((left, right) => left.category.localeCompare(right.category));

  const qualitativeThemes = summarizeQualitativeThemes(
    company.screeningQualitativeFeedback.map((entry) => ({
      theme: entry.theme,
      sentiment: entry.sentiment
    }))
  );

  if (type === "INTAKE") {
    return {
      ...baseSnapshot,
      kind: "INTAKE",
      atAGlanceProblem: company.atAGlanceProblem,
      atAGlanceSolution: company.atAGlanceSolution,
      atAGlanceImpact: company.atAGlanceImpact,
      atAGlanceKeyStrengths: company.atAGlanceKeyStrengths,
      atAGlanceKeyConsiderations: company.atAGlanceKeyConsiderations,
      ventureStudioCriteria: sanitizeVentureCriteria(company.pipeline?.ventureStudioCriteria),
      marketLandscape: marketLandscapePayloadFromRecord(company.marketLandscape, company.name)
    };
  }

  if (type === "SCREENING") {
    return {
      ...baseSnapshot,
      kind: "SCREENING",
      targetLoiCount: company.pipeline?.targetLoiCount || 3,
      screeningWebinarDate1At: formatDateIso(company.pipeline?.screeningWebinarDate1At),
      screeningWebinarDate2At: formatDateIso(company.pipeline?.screeningWebinarDate2At),
      allianceHealthSystems: allianceSummaries,
      quantitativeSummary,
      qualitativeThemes,
      loiCounts: loiStatusCounts(allianceSummaries)
    };
  }

  const opportunities: OpportunitySnapshotRow[] = company.opportunities.map((entry) => ({
    id: entry.id,
    title: entry.title,
    type: entry.type,
    stage: entry.stage,
    healthSystemName: entry.healthSystem?.name || null,
    likelihoodPercent: entry.likelihoodPercent,
    amountUsd: decimalToNumber(entry.amountUsd),
    contractPriceUsd: decimalToNumber(entry.contractPriceUsd),
    estimatedCloseDate: formatDateIso(entry.estimatedCloseDate),
    nextSteps: entry.nextSteps,
    updatedAt: entry.updatedAt.toISOString()
  }));

  const open = opportunities.filter((entry) => entry.stage !== "CLOSED_WON" && entry.stage !== "CLOSED_LOST");
  const closed = opportunities.filter((entry) => entry.stage === "CLOSED_WON" || entry.stage === "CLOSED_LOST");
  const won = opportunities.filter((entry) => entry.stage === "CLOSED_WON");
  const lost = opportunities.filter((entry) => entry.stage === "CLOSED_LOST");
  const openLikelihoodRows = open.map((entry) => entry.likelihoodPercent).filter((entry): entry is number => Number.isFinite(entry as number));
  const totalPipelineUsd = open.reduce((sum, entry) => sum + (entry.contractPriceUsd ?? entry.amountUsd ?? 0), 0);
  const weightedPipelineUsd = open.reduce((sum, entry) => {
    const base = entry.contractPriceUsd ?? entry.amountUsd ?? 0;
    const likelihood = (entry.likelihoodPercent ?? 0) / 100;
    return sum + base * likelihood;
  }, 0);
  const stageCountsMap = new Map<string, number>();
  for (const entry of open) {
    const current = stageCountsMap.get(entry.stage) || 0;
    stageCountsMap.set(entry.stage, current + 1);
  }
  const stageCounts = Array.from(stageCountsMap.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((left, right) => right.count - left.count || left.stage.localeCompare(right.stage));

  const now = Date.now();
  const toDays = (value: string | null) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
    return Math.ceil((parsed.getTime() - now) / (1000 * 60 * 60 * 24));
  };

  const next30Days = open
    .filter((entry) => {
      const days = toDays(entry.estimatedCloseDate);
      return days >= 0 && days <= 30;
    })
    .slice(0, 8);
  const next60Days = open
    .filter((entry) => {
      const days = toDays(entry.estimatedCloseDate);
      return days > 30 && days <= 60;
    })
    .slice(0, 8);
  const next90Days = open
    .filter((entry) => {
      const days = toDays(entry.estimatedCloseDate);
      return days > 60 && days <= 90;
    })
    .slice(0, 8);

  return {
    ...baseSnapshot,
    kind: "OPPORTUNITY",
    opportunities,
    metrics: {
      openCount: open.length,
      closedCount: closed.length,
      wonCount: won.length,
      lostCount: lost.length,
      totalPipelineUsd,
      weightedPipelineUsd,
      averageLikelihoodPercent:
        openLikelihoodRows.length > 0
          ? Math.round(
              (openLikelihoodRows.reduce((sum, score) => sum + score, 0) / openLikelihoodRows.length) * 10
            ) / 10
          : null
    },
    stageCounts,
    next30Days,
    next60Days,
    next90Days
  };
}

function intakeSnapshot(snapshot: CompanyReportSourceSnapshot) {
  if (snapshot.kind === "INTAKE") return snapshot;
  throw new CompanyReportError("Expected Intake snapshot.", 400);
}

function screeningSnapshot(snapshot: CompanyReportSourceSnapshot) {
  if (snapshot.kind === "SCREENING") return snapshot;
  throw new CompanyReportError("Expected Screening snapshot.", 400);
}

function opportunitySnapshot(snapshot: CompanyReportSourceSnapshot) {
  if (snapshot.kind === "OPPORTUNITY") return snapshot;
  throw new CompanyReportError("Expected Opportunity snapshot.", 400);
}

const reportTemplates: Record<CompanyReportType, ReportTemplateDefinition> = {
  INTAKE: {
    type: "INTAKE",
    label: "Intake Report",
    sections: [
      {
        id: "company-profile",
        label: "Company Profile",
        description: "Foundational company context and source details.",
        autoTitle: () => "Company Profile",
        autoBodyHtml: (snapshot) => {
          const intake = intakeSnapshot(snapshot);
          return [
            `<p><strong>Website:</strong> ${escapeHtml(ensureText(intake.website))}</p>`,
            `<p><strong>Location:</strong> ${escapeHtml(ensureText(intake.location))}</p>`,
            `<p><strong>Lead Source:</strong> ${escapeHtml(ensureText(intake.leadSourceHealthSystemName))}</p>`,
            `<p><strong>Current Pipeline Phase:</strong> ${escapeHtml(ensureText(intake.phase))}</p>`,
            multilineParagraphHtml(intake.description)
          ].join("");
        }
      },
      {
        id: "at-a-glance",
        label: "At a Glance",
        description: "Problem, solution, impact, strengths, and considerations.",
        autoTitle: () => "At a Glance",
        autoBodyHtml: (snapshot) => {
          const intake = intakeSnapshot(snapshot);
          return [
            `<h4>Problem</h4>${multilineParagraphHtml(intake.atAGlanceProblem)}`,
            `<h4>Solution</h4>${multilineParagraphHtml(intake.atAGlanceSolution)}`,
            `<h4>Impact</h4>${multilineParagraphHtml(intake.atAGlanceImpact)}`,
            `<h4>Key Strengths</h4>${multilineParagraphHtml(intake.atAGlanceKeyStrengths)}`,
            `<h4>Key Considerations</h4>${multilineParagraphHtml(intake.atAGlanceKeyConsiderations)}`
          ].join("");
        }
      },
      {
        id: "venture-studio-criteria",
        label: "Venture Studio Criteria",
        description: "Assessment matrix with rationale per criterion.",
        autoTitle: () => "Venture Studio Criteria Assessment",
        autoBodyHtml: (snapshot) => {
          const intake = intakeSnapshot(snapshot);
          const rows = intake.ventureStudioCriteria.map((entry) => [
            entry.category,
            assessmentLabel(entry.assessment),
            ensureText(entry.rationale)
          ]);
          return tableHtml(["Category", "Assessment", "Rationale"], rows);
        }
      },
      {
        id: "market-landscape",
        label: "Market Landscape",
        description: "Structured landscape view from the 2x2 matrix.",
        autoTitle: () => "Market Landscape",
        autoBodyHtml: (snapshot) => {
          const intake = intakeSnapshot(snapshot);
          const cards = marketLandscapeCellKeys
            .map((cellKey) => intake.marketLandscape.cards.find((card) => card.key === cellKey))
            .filter(Boolean);
          const rows = cards.map((card) => [
            ensureText(card?.title),
            ensureText(card?.overview || card?.strengths),
            ensureText(card?.businessModel || card?.gaps)
          ]);
          return [
            `<p><strong>Section:</strong> ${escapeHtml(ensureText(intake.marketLandscape.sectionLabel))}</p>`,
            `<p><strong>Headline:</strong> ${escapeHtml(ensureText(intake.marketLandscape.headline))}</p>`,
            tableHtml(["Cell", "Primary", "Secondary"], rows)
          ].join("");
        }
      },
      {
        id: "recommendation-next-step",
        label: "Recommendation and Next Step",
        description: "Recommended action and supporting recent notes.",
        autoTitle: () => "Recommendation and Next Step",
        autoBodyHtml: (snapshot) => {
          const intake = intakeSnapshot(snapshot);
          const noteLines = intake.notes
            .slice(0, 6)
            .map((entry) => `[${formatDate(entry.createdAt)}] ${entry.author}: ${entry.note}`);
          return [
            `<h4>Recommended Next Step</h4>${multilineParagraphHtml(intake.nextStep)}`,
            `<h4>Supporting Notes</h4>${listHtml(noteLines, "No notes captured yet.")}`
          ].join("");
        }
      }
    ]
  },
  SCREENING: {
    type: "SCREENING",
    label: "Screening Report",
    sections: [
      {
        id: "screening-overview",
        label: "Screening Overview",
        description: "High-level screening and timeline summary.",
        autoTitle: () => "Screening Overview",
        autoBodyHtml: (snapshot) => {
          const screening = screeningSnapshot(snapshot);
          return [
            `<p><strong>Alliance Systems Tracked:</strong> ${screening.allianceHealthSystems.length}</p>`,
            `<p><strong>Target LOIs:</strong> ${screening.targetLoiCount}</p>`,
            `<p><strong>Webinar Date 1:</strong> ${escapeHtml(formatDate(screening.screeningWebinarDate1At))}</p>`,
            `<p><strong>Webinar Date 2:</strong> ${escapeHtml(formatDate(screening.screeningWebinarDate2At))}</p>`
          ].join("");
        }
      },
      {
        id: "alliance-participation",
        label: "Alliance Participation",
        description: "Status and participation details by alliance member.",
        autoTitle: () => "Alliance Participation",
        autoBodyHtml: (snapshot) => {
          const screening = screeningSnapshot(snapshot);
          const rows = screening.allianceHealthSystems.map((entry) => [
            entry.name,
            statusLabel(entry.status),
            `${entry.attendedCount}/${entry.participantCount}`,
            entry.statusUpdate || "No status update"
          ]);
          return tableHtml(["Health System", "LOI Status", "Attended/Tracked", "Status Update"], rows);
        }
      },
      {
        id: "quantitative-summary",
        label: "Quantitative Summary",
        description: "Category-level scoring averages and response volume.",
        autoTitle: () => "Quantitative Summary",
        autoBodyHtml: (snapshot) => {
          const screening = screeningSnapshot(snapshot);
          const rows = screening.quantitativeSummary.map((entry) => [
            entry.category,
            entry.averageScore === null ? "Not provided" : String(entry.averageScore),
            String(entry.responseCount)
          ]);
          return tableHtml(["Category", "Average Score", "Responses"], rows);
        }
      },
      {
        id: "qualitative-themes",
        label: "Qualitative Themes",
        description: "Common narrative themes from screening feedback.",
        autoTitle: () => "Qualitative Themes",
        autoBodyHtml: (snapshot) => {
          const screening = screeningSnapshot(snapshot);
          const rows = screening.qualitativeThemes.map((entry) => [
            entry.theme,
            String(entry.count),
            `P:${entry.sentimentBreakdown.positive} M:${entry.sentimentBreakdown.mixed} N:${entry.sentimentBreakdown.neutral} Neg:${entry.sentimentBreakdown.negative}`
          ]);
          return tableHtml(["Theme", "Mentions", "Sentiment Mix"], rows);
        }
      },
      {
        id: "loi-progression",
        label: "LOI Progression",
        description: "Current LOI pipeline status distribution.",
        autoTitle: () => "LOI Progression",
        autoBodyHtml: (snapshot) => {
          const screening = screeningSnapshot(snapshot);
          const totals = screening.loiCounts;
          return [
            `<div class="chip-row">`,
            `<span class="chip ${statusDotClass("NOT_STARTED")}">Not Started: ${totals.notStarted}</span>`,
            `<span class="chip ${statusDotClass("PENDING")}">Pending: ${totals.pending}</span>`,
            `<span class="chip ${statusDotClass("NEGOTIATING")}">Negotiating: ${totals.negotiating}</span>`,
            `<span class="chip ${statusDotClass("SIGNED")}">Signed: ${totals.signed}</span>`,
            `<span class="chip ${statusDotClass("DECLINED")}">Declined: ${totals.declined}</span>`,
            `</div>`
          ].join("");
        }
      },
      {
        id: "screening-recommendation",
        label: "Recommendation",
        description: "Program recommendation based on screening signal strength.",
        autoTitle: () => "Recommendation",
        autoBodyHtml: (snapshot) => {
          const screening = screeningSnapshot(snapshot);
          const signed = screening.loiCounts.signed;
          const negotiating = screening.loiCounts.negotiating;
          const pending = screening.loiCounts.pending;
          const recommendation =
            signed >= screening.targetLoiCount
              ? "Advance immediately to commercial acceleration planning."
              : signed + negotiating >= screening.targetLoiCount
                ? "Prioritize negotiations to close remaining LOIs and finalize readiness."
                : pending > 0
                  ? "Continue targeted screening follow-ups before acceleration."
                  : "Reassess fit and reset screening strategy.";
          return [
            `<p>${escapeHtml(recommendation)}</p>`,
            `<h4>Next Step</h4>${multilineParagraphHtml(screening.nextStep)}`
          ].join("");
        }
      }
    ]
  },
  OPPORTUNITY: {
    type: "OPPORTUNITY",
    label: "Opportunity Report",
    sections: [
      {
        id: "pipeline-overview",
        label: "Pipeline Overview",
        description: "Open/closed mix with core pipeline posture.",
        autoTitle: () => "Pipeline Overview",
        autoBodyHtml: (snapshot) => {
          const opportunity = opportunitySnapshot(snapshot);
          return [
            `<div class="chip-row">`,
            `<span class="chip">Open: ${opportunity.metrics.openCount}</span>`,
            `<span class="chip">Closed: ${opportunity.metrics.closedCount}</span>`,
            `<span class="chip">Won: ${opportunity.metrics.wonCount}</span>`,
            `<span class="chip">Lost: ${opportunity.metrics.lostCount}</span>`,
            `</div>`,
            `<p><strong>Total Open Pipeline:</strong> ${escapeHtml(currency(opportunity.metrics.totalPipelineUsd))}</p>`,
            `<p><strong>Weighted Pipeline:</strong> ${escapeHtml(currency(opportunity.metrics.weightedPipelineUsd))}</p>`
          ].join("");
        }
      },
      {
        id: "opportunity-table",
        label: "Opportunity Table",
        description: "Current opportunities across screening and commercial acceleration.",
        autoTitle: () => "Opportunity Detail",
        autoBodyHtml: (snapshot) => {
          const opportunity = opportunitySnapshot(snapshot);
          const rows = opportunity.opportunities.slice(0, 20).map((entry) => [
            entry.title,
            entry.type,
            entry.stage,
            entry.healthSystemName || "N/A",
            percent(entry.likelihoodPercent),
            currency(entry.contractPriceUsd ?? entry.amountUsd),
            formatDate(entry.estimatedCloseDate)
          ]);
          return tableHtml(
            ["Opportunity", "Type", "Stage", "Health System", "Likelihood", "Value", "Est. Close"],
            rows
          );
        }
      },
      {
        id: "weighted-pipeline-metrics",
        label: "Weighted Metrics",
        description: "Likelihood-weighted and stage-based pipeline metrics.",
        autoTitle: () => "Weighted Pipeline Metrics",
        autoBodyHtml: (snapshot) => {
          const opportunity = opportunitySnapshot(snapshot);
          const stageRows = opportunity.stageCounts.map((entry) => [entry.stage, String(entry.count)]);
          return [
            `<p><strong>Average Open Likelihood:</strong> ${escapeHtml(percent(opportunity.metrics.averageLikelihoodPercent))}</p>`,
            tableHtml(["Open Stage", "Opportunity Count"], stageRows)
          ].join("");
        }
      },
      {
        id: "plan-30-60-90",
        label: "30 / 60 / 90 Plan",
        description: "Near-term execution windows by expected close timing.",
        autoTitle: () => "30 / 60 / 90 Day Plan",
        autoBodyHtml: (snapshot) => {
          const opportunity = opportunitySnapshot(snapshot);
          const toAction = (entry: OpportunitySnapshotRow) =>
            `${entry.title} (${entry.stage}) - ${entry.nextSteps || "No next step captured"}`;
          return [
            `<h4>Next 30 Days</h4>${listHtml(opportunity.next30Days.map(toAction), "No opportunities in this window.")}`,
            `<h4>Days 31-60</h4>${listHtml(opportunity.next60Days.map(toAction), "No opportunities in this window.")}`,
            `<h4>Days 61-90</h4>${listHtml(opportunity.next90Days.map(toAction), "No opportunities in this window.")}`
          ].join("");
        }
      },
      {
        id: "opportunity-recommendation",
        label: "Recommendation",
        description: "Recommended focus areas for acceleration and conversion.",
        autoTitle: () => "Recommendation",
        autoBodyHtml: (snapshot) => {
          const opportunity = opportunitySnapshot(snapshot);
          const recommendation =
            opportunity.metrics.weightedPipelineUsd >= 1_000_000
              ? "Prioritize execution on highest-likelihood commercial acceleration opportunities."
              : opportunity.metrics.openCount > 0
                ? "Increase qualification rigor and sharpen next steps to improve conversion confidence."
                : "Pipeline is currently light; prioritize new opportunity creation."
          return [
            `<p>${escapeHtml(recommendation)}</p>`,
            `<h4>Next Step</h4>${multilineParagraphHtml(opportunity.nextStep)}`
          ].join("");
        }
      }
    ]
  }
};

function defaultSectionState(type: CompanyReportType): ReportSectionState[] {
  const template = reportTemplates[type];
  return template.sections.map((section) => ({
    sectionId: section.id,
    mode: "AUTO",
    isHidden: false,
    overrideTitle: "",
    overrideBodyHtml: ""
  }));
}

function normalizeSectionState(
  type: CompanyReportType,
  raw: unknown
): ReportSectionState[] {
  const template = reportTemplates[type];
  const defaults = defaultSectionState(type);
  if (!Array.isArray(raw)) return defaults;

  const byId = new Map<string, ReportSectionState>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const typed = entry as {
      sectionId?: unknown;
      mode?: unknown;
      isHidden?: unknown;
      overrideTitle?: unknown;
      overrideBodyHtml?: unknown;
    };
    const sectionId = typeof typed.sectionId === "string" ? typed.sectionId.trim() : "";
    if (!sectionId) continue;
    const sectionExists = template.sections.some((section) => section.id === sectionId);
    if (!sectionExists) continue;
    byId.set(sectionId, {
      sectionId,
      mode: typed.mode === "OVERRIDE" ? "OVERRIDE" : "AUTO",
      isHidden: Boolean(typed.isHidden),
      overrideTitle: typeof typed.overrideTitle === "string" ? typed.overrideTitle.trim() : "",
      overrideBodyHtml: sanitizeOverrideHtml(
        typeof typed.overrideBodyHtml === "string" ? typed.overrideBodyHtml : ""
      )
    });
  }

  return defaults.map((entry) => byId.get(entry.sectionId) || entry);
}

function parseSourceSnapshot(
  type: CompanyReportType,
  raw: unknown
): CompanyReportSourceSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CompanyReportError("Report snapshot is invalid.", 400);
  }

  const typed = raw as { kind?: unknown };
  if (typed.kind !== type) {
    throw new CompanyReportError("Report snapshot type mismatch.", 400);
  }
  return raw as CompanyReportSourceSnapshot;
}

function resolveSections(
  type: CompanyReportType,
  sourceSnapshot: CompanyReportSourceSnapshot,
  sectionState: ReportSectionState[]
) {
  const template = reportTemplates[type];
  const stateById = new Map(sectionState.map((entry) => [entry.sectionId, entry] as const));

  return template.sections.map((section) => {
    const state = stateById.get(section.id) || {
      sectionId: section.id,
      mode: "AUTO" as const,
      isHidden: false,
      overrideTitle: "",
      overrideBodyHtml: ""
    };
    const autoTitle = section.autoTitle(sourceSnapshot);
    const autoBodyHtml = section.autoBodyHtml(sourceSnapshot);
    const resolvedTitle =
      state.mode === "OVERRIDE" && state.overrideTitle.trim().length > 0
        ? state.overrideTitle.trim()
        : autoTitle;
    const resolvedBodyHtml =
      state.mode === "OVERRIDE" && state.overrideBodyHtml.trim().length > 0
        ? sanitizeOverrideHtml(state.overrideBodyHtml)
        : autoBodyHtml;

    return {
      sectionId: section.id,
      label: section.label,
      description: section.description,
      mode: state.mode,
      isHidden: state.isHidden,
      overrideTitle: state.overrideTitle,
      overrideBodyHtml: state.overrideBodyHtml,
      autoTitle,
      autoBodyHtml,
      resolvedTitle,
      resolvedBodyHtml
    } satisfies CompanyReportSectionView;
  });
}

function renderReportHtml(input: {
  title: string;
  subtitle: string | null;
  audienceLabel: string | null;
  confidentialityLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  companyName: string;
  typeLabel: string;
  generatedAt: string;
  sections: CompanyReportSectionView[];
}) {
  const renderedSections = input.sections
    .filter((section) => !section.isHidden)
    .map(
      (section) => `
      <section class="report-section" data-section-id="${escapeHtml(section.sectionId)}">
        <h2>${escapeHtml(section.resolvedTitle)}</h2>
        <div class="section-body">${section.resolvedBodyHtml}</div>
      </section>
    `
    )
    .join("");

  const periodText =
    input.periodStart || input.periodEnd
      ? `${input.periodStart ? formatDate(input.periodStart) : "Start not set"} - ${input.periodEnd ? formatDate(input.periodEnd) : "End not set"}`
      : "Not provided";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        --report-bg: #ececec;
        --report-panel: #ffffff;
        --report-ink: #12233e;
        --report-muted: #566274;
        --report-border: #d6dbe4;
        --report-accent: #1b3a63;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--report-bg);
        color: var(--report-ink);
        font-family: "Avenir Next", "Avenir", "Segoe UI", sans-serif;
      }
      .report-root {
        max-width: 980px;
        margin: 0 auto;
        padding: 28px 18px 40px;
      }
      .cover {
        background: var(--report-panel);
        border: 1px solid var(--report-border);
        border-radius: 16px;
        padding: 28px;
      }
      .brand {
        font-weight: 800;
        letter-spacing: 0.08em;
        color: var(--report-accent);
        font-size: 14px;
      }
      .cover h1 {
        margin: 16px 0 8px;
        font-size: clamp(28px, 4vw, 46px);
        line-height: 1.1;
      }
      .cover .subtitle {
        margin: 0 0 16px;
        font-size: 24px;
        color: var(--report-ink);
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 10px;
      }
      .meta-item {
        border-top: 1px solid var(--report-border);
        padding-top: 8px;
      }
      .meta-item label {
        display: block;
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--report-muted);
        margin-bottom: 4px;
      }
      .meta-item div {
        font-size: 13px;
      }
      .report-section {
        background: var(--report-panel);
        border: 1px solid var(--report-border);
        border-radius: 14px;
        padding: 22px;
        margin-top: 14px;
      }
      .report-section h2 {
        margin: 0 0 14px;
        font-size: 20px;
        line-height: 1.2;
      }
      .section-body h4 {
        margin: 16px 0 8px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--report-muted);
      }
      .section-body p, .section-body li {
        font-size: 15px;
        line-height: 1.5;
      }
      .section-body ul {
        margin: 0;
        padding-left: 18px;
      }
      .report-table-wrap {
        overflow-x: auto;
        border: 1px solid var(--report-border);
        border-radius: 10px;
        margin-top: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        padding: 10px;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid var(--report-border);
      }
      th {
        background: #f7f9fc;
        color: var(--report-muted);
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.05em;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .chip-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .chip {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: #eef2f7;
        border: 1px solid var(--report-border);
        font-size: 12px;
      }
      .chip.green { background: #e7f7ea; border-color: #bde6c6; }
      .chip.yellow { background: #fff8df; border-color: #f2dfa2; }
      .chip.red { background: #fdecef; border-color: #f1c2cb; }
      .chip.grey { background: #edf0f4; border-color: #d3dae4; }
      .report-footer {
        margin-top: 14px;
        text-align: right;
        color: var(--report-muted);
        font-size: 12px;
      }
      @media print {
        body { background: #fff; }
        .report-root { max-width: none; padding: 0; }
        .cover, .report-section { border: 1px solid #ddd; break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="report-root">
      <section class="cover">
        <div class="brand">ABUNDANT</div>
        <h1>${escapeHtml(input.companyName)}</h1>
        <p class="subtitle">${escapeHtml(input.typeLabel)}</p>
        <div class="meta-grid">
          <div class="meta-item"><label>Title</label><div>${escapeHtml(ensureText(input.title))}</div></div>
          <div class="meta-item"><label>Subtitle</label><div>${escapeHtml(ensureText(input.subtitle))}</div></div>
          <div class="meta-item"><label>Audience</label><div>${escapeHtml(ensureText(input.audienceLabel))}</div></div>
          <div class="meta-item"><label>Period</label><div>${escapeHtml(periodText)}</div></div>
          <div class="meta-item"><label>Confidentiality</label><div>${escapeHtml(ensureText(input.confidentialityLabel, "Standard"))}</div></div>
          <div class="meta-item"><label>Generated</label><div>${escapeHtml(formatDate(input.generatedAt))}</div></div>
        </div>
      </section>
      ${renderedSections}
      <div class="report-footer">Prepared by Abundant Venture Studio</div>
    </main>
  </body>
</html>`;
}

function collectReportTextForPdf(
  title: string,
  subtitle: string | null,
  metadata: Array<{ label: string; value: string }>,
  sections: CompanyReportSectionView[]
) {
  const lines: string[] = [];
  lines.push(title);
  if (subtitle) lines.push(subtitle);
  lines.push("");
  for (const entry of metadata) {
    lines.push(`${entry.label}: ${entry.value}`);
  }
  lines.push("");
  for (const section of sections) {
    if (section.isHidden) continue;
    lines.push(section.resolvedTitle);
    lines.push("-".repeat(Math.max(8, Math.min(64, section.resolvedTitle.length))));
    lines.push(htmlToPlainText(section.resolvedBodyHtml) || "Not provided");
    lines.push("");
  }
  return lines.join("\n");
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: { widthOfTextAtSize: (text: string, size: number) => number }
) {
  if (!text.trim()) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(next, fontSize);
    if (width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

async function buildPdfBytes(input: {
  title: string;
  subtitle: string | null;
  metadata: Array<{ label: string; value: string }>;
  sections: CompanyReportSectionView[];
}) {
  const plainText = collectReportTextForPdf(input.title, input.subtitle, input.metadata, input.sections);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = { width: 612, height: 792 };
  const margin = 48;
  const contentWidth = pageSize.width - margin * 2;
  const lineHeight = 16;

  let page = pdf.addPage([pageSize.width, pageSize.height]);
  let cursorY = pageSize.height - margin;

  const drawWrappedLine = (value: string, opts?: { fontSize?: number; bold?: boolean; gapAfter?: number }) => {
    const fontSize = opts?.fontSize ?? 11;
    const drawFont = opts?.bold ? bold : regular;
    const lines = wrapText(value, contentWidth, fontSize, drawFont);
    for (const line of lines) {
      if (cursorY < margin + lineHeight) {
        page = pdf.addPage([pageSize.width, pageSize.height]);
        cursorY = pageSize.height - margin;
      }
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: fontSize,
        font: drawFont,
        color: rgb(0.1, 0.16, 0.28)
      });
      cursorY -= lineHeight;
    }
    if (opts?.gapAfter) cursorY -= opts.gapAfter;
  };

  drawWrappedLine(input.title, { fontSize: 20, bold: true, gapAfter: 4 });
  if (input.subtitle) drawWrappedLine(input.subtitle, { fontSize: 13, gapAfter: 10 });
  for (const entry of input.metadata) {
    drawWrappedLine(`${entry.label}: ${entry.value}`, { fontSize: 10 });
  }
  cursorY -= 8;

  const lines = plainText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      cursorY -= 6;
      continue;
    }
    const isHeading = trimmed.length <= 70 && /^[-A-Za-z0-9 /()&,.:]+$/.test(trimmed) && trimmed === trimmed.toUpperCase();
    drawWrappedLine(trimmed, { bold: isHeading, fontSize: isHeading ? 12 : 10 });
  }

  return pdf.save();
}

function toPdfDataUrl(bytes: Uint8Array) {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

function parseMetadata(input: {
  title?: string | null;
  subtitle?: string | null;
  audienceLabel?: string | null;
  confidentialityLabel?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const title = (input.title || "").trim();
  if (!title) {
    throw new CompanyReportError("Report title is required.", 400);
  }

  return {
    title,
    subtitle: (input.subtitle || "").trim() || null,
    audienceLabel: (input.audienceLabel || "").trim() || null,
    confidentialityLabel: (input.confidentialityLabel || "").trim() || null,
    periodStart: parseOptionalDate(input.periodStart),
    periodEnd: parseOptionalDate(input.periodEnd)
  } satisfies ReportMetadataInput;
}

function fallbackTitle(companyName: string, type: CompanyReportType) {
  const datePart = new Date().toISOString().slice(0, 10);
  return `${companyName} - ${reportTypeLabelByType[type]} - ${datePart}`;
}

type StoredCompanyReport = CompanyReport & {
  company: {
    id: string;
    name: string;
  };
};

async function getStoredCompanyReport(companyId: string, reportId: string) {
  const report = await prisma.companyReport.findFirst({
    where: {
      id: reportId,
      companyId
    },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!report) {
    throw new CompanyReportError("Report not found.", 404);
  }

  return report as StoredCompanyReport;
}

function buildDetailView(report: StoredCompanyReport) {
  const sourceSnapshot = parseSourceSnapshot(report.type, report.sourceSnapshotJson);
  const sectionState = normalizeSectionState(report.type, report.sectionStateJson);
  const sections = resolveSections(report.type, sourceSnapshot, sectionState);
  const renderedHtml = renderReportHtml({
    title: report.title,
    subtitle: report.subtitle,
    audienceLabel: report.audienceLabel,
    confidentialityLabel: report.confidentialityLabel,
    periodStart: formatDateIso(report.periodStart),
    periodEnd: formatDateIso(report.periodEnd),
    companyName: report.company.name,
    typeLabel: reportTypeLabelByType[report.type],
    generatedAt: sourceSnapshot.generatedAt,
    sections
  });

  return {
    id: report.id,
    companyId: report.companyId,
    type: report.type,
    typeLabel: reportTypeLabelByType[report.type],
    status: report.status,
    templateVersion: report.templateVersion,
    title: report.title,
    subtitle: report.subtitle,
    audienceLabel: report.audienceLabel,
    confidentialityLabel: report.confidentialityLabel,
    periodStart: formatDateIso(report.periodStart),
    periodEnd: formatDateIso(report.periodEnd),
    publishedAt: formatDateIso(report.publishedAt),
    createdByUserId: report.createdByUserId,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    sections,
    renderedHtml
  } satisfies CompanyReportDetailView;
}

export async function listCompanyReports(input: {
  companyId: string;
  type?: CompanyReportType | null;
}) {
  const reports = await prisma.companyReport.findMany({
    where: {
      companyId: input.companyId,
      ...(input.type ? { type: input.type } : {})
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      companyId: true,
      type: true,
      status: true,
      templateVersion: true,
      title: true,
      subtitle: true,
      audienceLabel: true,
      confidentialityLabel: true,
      periodStart: true,
      periodEnd: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return reports.map((entry) => ({
    id: entry.id,
    companyId: entry.companyId,
    type: entry.type,
    typeLabel: reportTypeLabelByType[entry.type],
    status: entry.status,
    templateVersion: entry.templateVersion,
    title: entry.title,
    subtitle: entry.subtitle,
    audienceLabel: entry.audienceLabel,
    confidentialityLabel: entry.confidentialityLabel,
    periodStart: formatDateIso(entry.periodStart),
    periodEnd: formatDateIso(entry.periodEnd),
    publishedAt: formatDateIso(entry.publishedAt),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  }));
}

export async function createCompanyReportDraft(input: {
  companyId: string;
  type: CompanyReportType;
  userId: string | null;
  title?: string | null;
  subtitle?: string | null;
  audienceLabel?: string | null;
  confidentialityLabel?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const sourceSnapshot = await buildReportSnapshot(input.companyId, input.type);
  const title = (input.title || "").trim() || fallbackTitle(sourceSnapshot.companyName, input.type);

  const metadata = parseMetadata({
    title,
    subtitle: input.subtitle || null,
    audienceLabel: input.audienceLabel || null,
    confidentialityLabel: input.confidentialityLabel || null,
    periodStart: input.periodStart || null,
    periodEnd: input.periodEnd || null
  });

  const created = await prisma.companyReport.create({
    data: {
      companyId: input.companyId,
      type: input.type,
      status: "DRAFT",
      templateVersion: REPORT_TEMPLATE_VERSION,
      title: metadata.title,
      subtitle: metadata.subtitle,
      audienceLabel: metadata.audienceLabel,
      confidentialityLabel: metadata.confidentialityLabel,
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      sourceSnapshotJson: sourceSnapshot,
      sectionStateJson: defaultSectionState(input.type),
      renderedHtml: null,
      createdByUserId: input.userId
    },
    include: {
      company: {
        select: { id: true, name: true }
      }
    }
  });

  return buildDetailView(created as StoredCompanyReport);
}

export async function getCompanyReportDetail(input: {
  companyId: string;
  reportId: string;
}) {
  const report = await getStoredCompanyReport(input.companyId, input.reportId);
  return buildDetailView(report);
}

export async function updateCompanyReportDraft(input: {
  companyId: string;
  reportId: string;
  expectedUpdatedAt?: string | null;
  title?: string | null;
  subtitle?: string | null;
  audienceLabel?: string | null;
  confidentialityLabel?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sectionState?: ReportSectionState[] | null;
  refreshFromLatestData?: boolean;
  resetOverrides?: boolean;
}) {
  const current = await getStoredCompanyReport(input.companyId, input.reportId);
  if (current.status !== "DRAFT") {
    throw new CompanyReportError("Published reports are immutable. Create a new draft to continue editing.", 409);
  }

  if (input.expectedUpdatedAt) {
    const expectedDate = new Date(input.expectedUpdatedAt);
    if (!Number.isNaN(expectedDate.getTime()) && expectedDate.getTime() !== current.updatedAt.getTime()) {
      throw new CompanyReportError("Report has changed since you loaded it. Refresh and retry.", 409);
    }
  }

  const metadata = parseMetadata({
    title: input.title ?? current.title,
    subtitle: input.subtitle ?? current.subtitle,
    audienceLabel: input.audienceLabel ?? current.audienceLabel,
    confidentialityLabel: input.confidentialityLabel ?? current.confidentialityLabel,
    periodStart: input.periodStart ?? formatDateIso(current.periodStart),
    periodEnd: input.periodEnd ?? formatDateIso(current.periodEnd)
  });

  const sourceSnapshot = input.refreshFromLatestData
    ? await buildReportSnapshot(current.companyId, current.type)
    : parseSourceSnapshot(current.type, current.sourceSnapshotJson);

  const existingState = normalizeSectionState(current.type, current.sectionStateJson);
  const incomingState = input.sectionState ? normalizeSectionState(current.type, input.sectionState) : existingState;
  const nextState = input.resetOverrides
    ? incomingState.map((entry) => ({
        ...entry,
        mode: "AUTO" as const,
        overrideTitle: "",
        overrideBodyHtml: ""
      }))
    : incomingState;

  const updated = await prisma.companyReport.update({
    where: { id: current.id },
    data: {
      title: metadata.title,
      subtitle: metadata.subtitle,
      audienceLabel: metadata.audienceLabel,
      confidentialityLabel: metadata.confidentialityLabel,
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      sourceSnapshotJson: sourceSnapshot,
      sectionStateJson: nextState
    },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return buildDetailView(updated as StoredCompanyReport);
}

export async function previewCompanyReport(input: {
  companyId: string;
  reportId: string;
}) {
  const report = await getStoredCompanyReport(input.companyId, input.reportId);
  const detail = buildDetailView(report);
  await prisma.companyReport.update({
    where: { id: report.id },
    data: {
      renderedHtml: detail.renderedHtml
    }
  });
  return detail;
}

async function createDocumentArtifactFromReport(report: CompanyReportDetailView) {
  const metadata = [
    { label: "Audience", value: ensureText(report.audienceLabel) },
    {
      label: "Period",
      value:
        report.periodStart || report.periodEnd
          ? `${report.periodStart ? formatDate(report.periodStart) : "Start not set"} - ${
              report.periodEnd ? formatDate(report.periodEnd) : "End not set"
            }`
          : "Not provided"
    },
    { label: "Confidentiality", value: ensureText(report.confidentialityLabel, "Standard") },
    { label: "Generated", value: formatDate(new Date().toISOString()) }
  ];

  const pdfBytes = await buildPdfBytes({
    title: report.title,
    subtitle: report.subtitle,
    metadata,
    sections: report.sections
  });
  const documentUrl = toPdfDataUrl(pdfBytes);
  const datePart = new Date().toISOString().slice(0, 10);
  const documentTitle = `${report.title} (${datePart}).pdf`;

  const created = await prisma.companyDocument.create({
    data: {
      companyId: report.companyId,
      type: reportDocumentTypeByType[report.type],
      title: documentTitle,
      url: documentUrl,
      notes: "Generated by Report Composer."
    },
    select: {
      id: true,
      type: true,
      title: true,
      url: true,
      notes: true,
      uploadedAt: true
    }
  });

  return {
    id: created.id,
    type: created.type,
    title: created.title,
    url: created.url,
    notes: created.notes,
    uploadedAt: created.uploadedAt.toISOString()
  };
}

export async function exportCompanyReport(input: {
  companyId: string;
  reportId: string;
}) {
  const report = await getStoredCompanyReport(input.companyId, input.reportId);
  const detail = buildDetailView(report);
  const document = await createDocumentArtifactFromReport(detail);
  await prisma.companyReport.update({
    where: { id: report.id },
    data: {
      renderedHtml: detail.renderedHtml
    }
  });
  return {
    report: detail,
    document
  };
}

export async function publishCompanyReport(input: {
  companyId: string;
  reportId: string;
}) {
  const report = await getStoredCompanyReport(input.companyId, input.reportId);
  if (report.status !== "DRAFT") {
    throw new CompanyReportError("Report has already been published.", 409);
  }

  const detail = buildDetailView(report);
  const document = await createDocumentArtifactFromReport(detail);
  const published = await prisma.companyReport.update({
    where: { id: report.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      renderedHtml: detail.renderedHtml
    },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return {
    report: buildDetailView(published as StoredCompanyReport),
    document
  };
}

export function parseReportType(value: unknown) {
  if (value === "INTAKE" || value === "SCREENING" || value === "OPPORTUNITY") return value;
  throw new CompanyReportError("Invalid report type.", 400);
}

export function parseSectionStatePayload(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows: ReportSectionState[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const typed = entry as {
      sectionId?: unknown;
      mode?: unknown;
      isHidden?: unknown;
      overrideTitle?: unknown;
      overrideBodyHtml?: unknown;
    };
    rows.push({
      sectionId: typeof typed.sectionId === "string" ? typed.sectionId : "",
      mode: typed.mode === "OVERRIDE" ? "OVERRIDE" : "AUTO",
      isHidden: Boolean(typed.isHidden),
      overrideTitle: typeof typed.overrideTitle === "string" ? typed.overrideTitle : "",
      overrideBodyHtml: typeof typed.overrideBodyHtml === "string" ? typed.overrideBodyHtml : ""
    });
  }
  return rows;
}
