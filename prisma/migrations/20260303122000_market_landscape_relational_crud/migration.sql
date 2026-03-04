-- CreateTable
CREATE TABLE "CompanyMarketLandscape" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sectionLabel" TEXT NOT NULL DEFAULT 'Market Landscape',
    "headline" TEXT NOT NULL DEFAULT '',
    "subheadline" TEXT NOT NULL DEFAULT '',
    "template" TEXT NOT NULL DEFAULT 'CATEGORY_OVERVIEW',
    "xAxisLabel" TEXT NOT NULL DEFAULT 'Product Category',
    "yAxisLabel" TEXT NOT NULL DEFAULT 'Differentiation',
    "columnLabel1" TEXT NOT NULL DEFAULT 'Adjacent Players',
    "columnLabel2" TEXT NOT NULL DEFAULT 'Most Similar',
    "rowLabel1" TEXT NOT NULL DEFAULT 'GI-Specific',
    "rowLabel2" TEXT NOT NULL DEFAULT 'Generalist',
    "primaryFocusCellKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMarketLandscape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMarketLandscapeCard" (
    "id" TEXT NOT NULL,
    "marketLandscapeId" TEXT NOT NULL,
    "cellKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "overview" TEXT NOT NULL DEFAULT '',
    "businessModel" TEXT NOT NULL DEFAULT '',
    "strengths" TEXT NOT NULL DEFAULT '',
    "gaps" TEXT NOT NULL DEFAULT '',
    "vendors" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMarketLandscapeCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMarketLandscape_companyId_key" ON "CompanyMarketLandscape"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMarketLandscapeCard_marketLandscapeId_cellKey_key" ON "CompanyMarketLandscapeCard"("marketLandscapeId", "cellKey");

-- CreateIndex
CREATE INDEX "CompanyMarketLandscapeCard_marketLandscapeId_sortOrder_idx" ON "CompanyMarketLandscapeCard"("marketLandscapeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CompanyMarketLandscape" ADD CONSTRAINT "CompanyMarketLandscape_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMarketLandscapeCard" ADD CONSTRAINT "CompanyMarketLandscapeCard_marketLandscapeId_fkey" FOREIGN KEY ("marketLandscapeId") REFERENCES "CompanyMarketLandscape"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from the previous CompanyPipeline JSON field when present.
INSERT INTO "CompanyMarketLandscape" (
  "id",
  "companyId",
  "sectionLabel",
  "headline",
  "subheadline",
  "template",
  "xAxisLabel",
  "yAxisLabel",
  "columnLabel1",
  "columnLabel2",
  "rowLabel1",
  "rowLabel2",
  "primaryFocusCellKey",
  "createdAt",
  "updatedAt"
)
SELECT
  'ml_' || cp."companyId",
  cp."companyId",
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->>'sectionLabel'), ''), 'Market Landscape'),
  COALESCE(cp."marketLandscape"->>'headline', ''),
  COALESCE(cp."marketLandscape"->>'subheadline', ''),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->>'template'), ''), 'CATEGORY_OVERVIEW'),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->>'xAxisLabel'), ''), 'Product Category'),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->>'yAxisLabel'), ''), 'Differentiation'),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->'columnLabels'->>0), ''), 'Adjacent Players'),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->'columnLabels'->>1), ''), 'Most Similar'),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->'rowLabels'->>0), ''), 'GI-Specific'),
  COALESCE(NULLIF(BTRIM(cp."marketLandscape"->'rowLabels'->>1), ''), 'Generalist'),
  NULLIF(BTRIM(cp."marketLandscape"->>'primaryFocusCellKey'), ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CompanyPipeline" cp
WHERE cp."marketLandscape" IS NOT NULL;

WITH extracted_cards AS (
  SELECT
    ml."id" AS market_landscape_id,
    ml."companyId" AS company_id,
    COALESCE(
      NULLIF(BTRIM(card.value->>'key'), ''),
      FORMAT('r%sc%s', ((card.ordinality - 1) / 2)::INT, ((card.ordinality - 1) % 2)::INT)
    ) AS cell_key,
    (card.ordinality - 1)::INT AS sort_order,
    COALESCE(card.value->>'title', '') AS title,
    COALESCE(card.value->>'overview', '') AS overview,
    COALESCE(card.value->>'businessModel', '') AS business_model,
    COALESCE(card.value->>'strengths', '') AS strengths,
    COALESCE(card.value->>'gaps', '') AS gaps,
    COALESCE(card.value->>'vendors', '') AS vendors
  FROM "CompanyPipeline" cp
  JOIN "CompanyMarketLandscape" ml ON ml."companyId" = cp."companyId"
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cp."marketLandscape"->'cards', '[]'::jsonb)) WITH ORDINALITY AS card(value, ordinality)
  WHERE cp."marketLandscape" IS NOT NULL
), ranked_cards AS (
  SELECT
    market_landscape_id,
    company_id,
    cell_key,
    sort_order,
    title,
    overview,
    business_model,
    strengths,
    gaps,
    vendors,
    ROW_NUMBER() OVER (PARTITION BY market_landscape_id, cell_key ORDER BY sort_order ASC) AS rn
  FROM extracted_cards
)
INSERT INTO "CompanyMarketLandscapeCard" (
  "id",
  "marketLandscapeId",
  "cellKey",
  "sortOrder",
  "title",
  "overview",
  "businessModel",
  "strengths",
  "gaps",
  "vendors",
  "createdAt",
  "updatedAt"
)
SELECT
  'mlc_' || company_id || '_' || cell_key,
  market_landscape_id,
  cell_key,
  sort_order,
  title,
  overview,
  business_model,
  strengths,
  gaps,
  vendors,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM ranked_cards
WHERE rn = 1;

ALTER TABLE "CompanyPipeline" DROP COLUMN "marketLandscape";
