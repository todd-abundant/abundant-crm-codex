const MARKET_LANDSCAPE_CELL_KEYS = ["r0c0", "r0c1", "r1c0", "r1c1"] as const;
const MARKET_LANDSCAPE_GRID_ROWS = [
  ["r0c0", "r0c1"],
  ["r1c0", "r1c1"]
] as const;
const MARKET_LANDSCAPE_TEMPLATE_VALUES = ["CATEGORY_OVERVIEW", "STRENGTHS_GAPS"] as const;

export type MarketLandscapeCellKey = (typeof MARKET_LANDSCAPE_CELL_KEYS)[number];
export type MarketLandscapeTemplate = (typeof MARKET_LANDSCAPE_TEMPLATE_VALUES)[number];

export type MarketLandscapeCard = {
  id?: string;
  key: MarketLandscapeCellKey;
  title: string;
  overview: string;
  businessModel: string;
  strengths: string;
  gaps: string;
  vendors: string;
};

export type MarketLandscapePayload = {
  sectionLabel: string;
  headline: string;
  subheadline: string;
  template: MarketLandscapeTemplate;
  xAxisLabel: string;
  yAxisLabel: string;
  columnLabels: [string, string];
  rowLabels: [string, string];
  primaryFocusCellKey: MarketLandscapeCellKey | "";
  cards: MarketLandscapeCard[];
};

export const marketLandscapeCellKeys = MARKET_LANDSCAPE_CELL_KEYS;
export const marketLandscapeGridRows = MARKET_LANDSCAPE_GRID_ROWS;
export const marketLandscapeTemplateOptions: Array<{
  value: MarketLandscapeTemplate;
  label: string;
}> = [
  { value: "CATEGORY_OVERVIEW", label: "Category Overview + Business Model" },
  { value: "STRENGTHS_GAPS", label: "Strengths + Gaps" }
];

function toSafeString(value: unknown, fallback = "", maxLength = 1200) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function toTemplate(value: unknown): MarketLandscapeTemplate {
  return MARKET_LANDSCAPE_TEMPLATE_VALUES.includes(value as MarketLandscapeTemplate)
    ? (value as MarketLandscapeTemplate)
    : "CATEGORY_OVERVIEW";
}

function toCellKey(value: unknown): MarketLandscapeCellKey | "" {
  if (value === "r0c0" || value === "r0c1" || value === "r1c0" || value === "r1c1") return value;
  return "";
}

function defaultCards(): MarketLandscapeCard[] {
  return [
    {
      key: "r0c0",
      title: "",
      overview: "",
      businessModel: "",
      strengths: "",
      gaps: "",
      vendors: ""
    },
    {
      key: "r0c1",
      title: "",
      overview: "",
      businessModel: "",
      strengths: "",
      gaps: "",
      vendors: ""
    },
    {
      key: "r1c0",
      title: "",
      overview: "",
      businessModel: "",
      strengths: "",
      gaps: "",
      vendors: ""
    },
    {
      key: "r1c1",
      title: "",
      overview: "",
      businessModel: "",
      strengths: "",
      gaps: "",
      vendors: ""
    }
  ];
}

export function defaultMarketLandscapePayload(companyName?: string | null): MarketLandscapePayload {
  const startupName = toSafeString(companyName, "The Company", 120);
  return {
    sectionLabel: "Market Landscape",
    headline: `${startupName} sits in a clearly defined market segment`,
    subheadline: "Map adjacent and directly comparable players by category.",
    template: "CATEGORY_OVERVIEW",
    xAxisLabel: "Product Category",
    yAxisLabel: "Differentiation",
    columnLabels: ["Adjacent Players", "Most Similar"],
    rowLabels: ["GI-Specific", "Generalist"],
    primaryFocusCellKey: "r0c1",
    cards: defaultCards()
  };
}

export function normalizeMarketLandscapePayload(
  raw: unknown,
  companyName?: string | null
): MarketLandscapePayload {
  const fallback = defaultMarketLandscapePayload(companyName);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const candidate = raw as {
    sectionLabel?: unknown;
    headline?: unknown;
    subheadline?: unknown;
    template?: unknown;
    xAxisLabel?: unknown;
    yAxisLabel?: unknown;
    columnLabels?: unknown;
    rowLabels?: unknown;
    primaryFocusCellKey?: unknown;
    cards?: unknown;
  };

  const cardsByKey = new Map<MarketLandscapeCellKey, MarketLandscapeCard>();
  if (Array.isArray(candidate.cards)) {
    for (const entry of candidate.cards) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const card = entry as {
        id?: unknown;
        key?: unknown;
        title?: unknown;
        overview?: unknown;
        businessModel?: unknown;
        strengths?: unknown;
        gaps?: unknown;
        vendors?: unknown;
      };
      const key = toCellKey(card.key);
      if (!key) continue;
      cardsByKey.set(key, {
        id: typeof card.id === "string" && card.id.trim() ? card.id.trim() : undefined,
        key,
        title: toSafeString(card.title, "", 120),
        overview: toSafeString(card.overview, "", 420),
        businessModel: toSafeString(card.businessModel, "", 180),
        strengths: toSafeString(card.strengths, "", 320),
        gaps: toSafeString(card.gaps, "", 320),
        vendors: toSafeString(card.vendors, "", 220)
      });
    }
  }

  const defaultCardMap = new Map(defaultCards().map((card) => [card.key, card] as const));
  const normalizedCards = MARKET_LANDSCAPE_CELL_KEYS.map((key) => cardsByKey.get(key) || defaultCardMap.get(key)!);

  const normalizedColumnLabels: [string, string] = [...fallback.columnLabels];
  if (Array.isArray(candidate.columnLabels)) {
    normalizedColumnLabels[0] = toSafeString(candidate.columnLabels[0], normalizedColumnLabels[0], 80);
    normalizedColumnLabels[1] = toSafeString(candidate.columnLabels[1], normalizedColumnLabels[1], 80);
  }

  const normalizedRowLabels: [string, string] = [...fallback.rowLabels];
  if (Array.isArray(candidate.rowLabels)) {
    normalizedRowLabels[0] = toSafeString(candidate.rowLabels[0], normalizedRowLabels[0], 80);
    normalizedRowLabels[1] = toSafeString(candidate.rowLabels[1], normalizedRowLabels[1], 80);
  }

  return {
    sectionLabel: toSafeString(candidate.sectionLabel, fallback.sectionLabel, 80),
    headline: toSafeString(candidate.headline, fallback.headline, 180),
    subheadline: toSafeString(candidate.subheadline, fallback.subheadline, 220),
    template: toTemplate(candidate.template),
    xAxisLabel: toSafeString(candidate.xAxisLabel, fallback.xAxisLabel, 80),
    yAxisLabel: toSafeString(candidate.yAxisLabel, fallback.yAxisLabel, 80),
    columnLabels: normalizedColumnLabels,
    rowLabels: normalizedRowLabels,
    primaryFocusCellKey: toCellKey(candidate.primaryFocusCellKey),
    cards: normalizedCards
  };
}

export type MarketLandscapeCardRecord = {
  id: string;
  cellKey: string;
  title: string;
  overview: string;
  businessModel: string;
  strengths: string;
  gaps: string;
  vendors: string;
};

export type MarketLandscapeRecord = {
  sectionLabel: string;
  headline: string;
  subheadline: string;
  template: string;
  xAxisLabel: string;
  yAxisLabel: string;
  columnLabel1: string;
  columnLabel2: string;
  rowLabel1: string;
  rowLabel2: string;
  primaryFocusCellKey: string | null;
  cards: MarketLandscapeCardRecord[];
};

export function marketLandscapePayloadFromRecord(
  record: MarketLandscapeRecord | null | undefined,
  companyName?: string | null
) {
  if (!record) return defaultMarketLandscapePayload(companyName);

  return normalizeMarketLandscapePayload(
    {
      sectionLabel: record.sectionLabel,
      headline: record.headline,
      subheadline: record.subheadline,
      template: record.template,
      xAxisLabel: record.xAxisLabel,
      yAxisLabel: record.yAxisLabel,
      columnLabels: [record.columnLabel1, record.columnLabel2],
      rowLabels: [record.rowLabel1, record.rowLabel2],
      primaryFocusCellKey: record.primaryFocusCellKey || "",
      cards: record.cards.map((card) => ({
        id: card.id,
        key: card.cellKey,
        title: card.title,
        overview: card.overview,
        businessModel: card.businessModel,
        strengths: card.strengths,
        gaps: card.gaps,
        vendors: card.vendors
      }))
    },
    companyName
  );
}
