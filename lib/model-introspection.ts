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

function getEnumValues(name: string): string[] {
  const enumDef = Prisma.dmmf.datamodel.enums.find((entry) => entry.name === name);
  return enumDef ? enumDef.values.map((value) => value.name) : [];
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

export function getNarrativeAgentModelNarrative() {
  const leadSourceTypes = getEnumValues("CompanyLeadSourceType");
  const companyHealthSystemRelationships = getEnumValues("CompanyHealthSystemRelationship");
  const companyCoInvestorRelationships = getEnumValues("CompanyCoInvestorRelationship");
  const contactRoleTypes = getEnumValues("ContactRoleType");
  const companyTypes = getEnumValues("CompanyType");
  const companyPrimaryCategories = getEnumValues("CompanyPrimaryCategory");

  const lines: string[] = [
    "Domain model narrative:",
    "1. Core entities are HealthSystem, Company, and CoInvestor.",
    "2. HealthSystem and CoInvestor are distinct entity types. A health system should not be modeled as a co-investor unless a distinct fund/investment arm is explicitly named.",
    "3. Company lead source is stored on Company using leadSourceType plus either leadSourceHealthSystemId (when source is a health system) or leadSourceOther.",
    `4. CompanyLeadSourceType enum values: ${leadSourceTypes.join(", ") || "N/A"}.`,
    `5. CompanyType enum values: ${companyTypes.join(", ") || "N/A"}.`,
    `6. CompanyPrimaryCategory enum values: ${companyPrimaryCategories.join(", ") || "N/A"}.`,
    "7. Company↔HealthSystem many-to-many relationships are represented by CompanyHealthSystemLink (companyId, healthSystemId, relationshipType, optional notes/investmentAmountUsd/ownershipPercent).",
    `8. CompanyHealthSystemRelationship enum values: ${companyHealthSystemRelationships.join(", ") || "N/A"}.`,
    "9. Company↔CoInvestor many-to-many relationships are represented by CompanyCoInvestorLink (companyId, coInvestorId, relationshipType, optional notes/investmentAmountUsd).",
    `10. CompanyCoInvestorRelationship enum values: ${companyCoInvestorRelationships.join(", ") || "N/A"}.`,
    "11. Contacts are canonical in Contact and linked to each parent entity through junction tables ContactHealthSystem, ContactCompany, and ContactCoInvestor with roleType and optional title.",
    `12. ContactRoleType enum values: ${contactRoleTypes.join(", ") || "N/A"}.`,
    "13. Execution ordering rule: create or resolve base entities before creating link records that depend on those entity IDs.",
    "14. Matching rule: if an existing entity match is >=80% confidence, default to using existing instead of creating duplicate records."
  ];

  return lines.join("\n");
}
