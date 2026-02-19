import { Prisma } from "@prisma/client";

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type DmmfField = DmmfModel["fields"][number];

function fieldTypeLabel(field: DmmfField) {
  if (field.kind === "object") {
    return `${field.type}${field.isList ? "[]" : ""} relation`;
  }
  if (field.kind === "enum") {
    return `${field.type}${field.isList ? "[]" : ""} enum`;
  }
  return `${field.type}${field.isList ? "[]" : ""}`;
}

function fieldFlags(field: DmmfField) {
  const flags: string[] = [];
  if (field.isId) flags.push("id");
  if (field.isUnique) flags.push("unique");
  if (field.isRequired) flags.push("required");
  if (!field.isRequired) flags.push("optional");
  return flags.join(", ");
}

function formatField(field: DmmfField) {
  const label = `${field.name}: ${fieldTypeLabel(field)}`;
  const flags = fieldFlags(field);
  return flags ? `${label} (${flags})` : label;
}

function sortFieldsByPriority(fields: readonly DmmfField[]) {
  return [...fields].sort((a, b) => {
    const aScore = a.isId ? 0 : a.kind === "object" ? 2 : 1;
    const bScore = b.isId ? 0 : b.kind === "object" ? 2 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return a.name.localeCompare(b.name);
  });
}

export function getModelDigest(modelNames?: string[]): string {
  const allowed = modelNames ? new Set(modelNames) : null;
  const models = Prisma.dmmf.datamodel.models.filter((model) =>
    allowed ? allowed.has(model.name) : true
  );

  const lines: string[] = [];

  for (const model of models) {
    lines.push(`Model ${model.name}`);
    const fields = sortFieldsByPriority(model.fields);
    for (const field of fields) {
      lines.push(`- ${formatField(field)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function getNarrativeAgentModelDigest() {
  return getModelDigest([
    "HealthSystem",
    "Company",
    "CoInvestor",
    "CompanyCoInvestorLink",
    "CompanyHealthSystemLink",
    "Contact",
    "ContactHealthSystem",
    "ContactCompany",
    "ContactCoInvestor"
  ]);
}
