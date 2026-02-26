-- Backfill existing company documents into shared entity documents
INSERT INTO "EntityDocument" (
  "id",
  "entityKind",
  "entityId",
  "title",
  "url",
  "notes",
  "uploadedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  d."id",
  'COMPANY'::"EntityKind",
  d."companyId",
  d."title",
  d."url",
  d."notes",
  d."uploadedAt",
  d."createdAt",
  d."createdAt"
FROM "CompanyDocument" d
ON CONFLICT ("id") DO NOTHING;

-- Backfill existing company pipeline notes into shared entity notes
INSERT INTO "EntityNote" (
  "id",
  "entityKind",
  "entityId",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  n."id",
  'COMPANY'::"EntityKind",
  n."companyId",
  n."note",
  n."createdAt",
  n."updatedAt"
FROM "CompanyPipelineNote" n
ON CONFLICT ("id") DO NOTHING;
