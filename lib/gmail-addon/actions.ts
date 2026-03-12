import {
  Prisma,
  type CompanyOpportunityStage,
  type CompanyOpportunityType,
  type ContactRoleType
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { createEntityNote, type EntityNoteAffiliation } from "@/lib/entity-record-content";
import {
  resolveOrCreateContact,
  upsertCompanyContactLink,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";
import {
  getFormValue,
  getFormValues,
  isTruthyInput,
  toNullableTrimmed,
  type AddonActor,
  type AddonEntityKind,
  type GmailAddonEvent,
  type MatchResults,
  type NormalizedMessageMetadata
} from "@/lib/gmail-addon/types";

const VALID_OPPORTUNITY_TYPES = new Set<CompanyOpportunityType>([
  "SCREENING_LOI",
  "VENTURE_STUDIO_SERVICES",
  "S1_TERM_SHEET",
  "COMMERCIAL_CONTRACT",
  "PROSPECT_PURSUIT"
]);

const VALID_OPPORTUNITY_STAGES = new Set<CompanyOpportunityStage>([
  "IDENTIFIED",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "LEGAL",
  "CLOSED_WON",
  "CLOSED_LOST",
  "ON_HOLD"
]);

type AttachTarget = {
  kind: AddonEntityKind;
  id: string;
};

function parseAttachTarget(value: string): AttachTarget | null {
  const [kindRaw, ...rest] = value.split(":");
  const id = rest.join(":").trim();
  if (!id) return null;

  const kind = kindRaw?.trim().toUpperCase();
  if (kind !== "CONTACT" && kind !== "COMPANY" && kind !== "HEALTH_SYSTEM" && kind !== "OPPORTUNITY") {
    return null;
  }

  return {
    kind,
    id
  };
}

function parsePrincipalSelection(value: string | null) {
  if (!value || value === "NONE") return null;

  const [kindRaw, ...rest] = value.split(":");
  const id = rest.join(":").trim();
  const kind = kindRaw?.trim().toUpperCase();

  if (!id) return null;
  if (kind !== "COMPANY" && kind !== "HEALTH_SYSTEM") return null;

  return {
    kind,
    id
  };
}

function toEntityKind(kind: Exclude<AddonEntityKind, "OPPORTUNITY">): "CONTACT" | "COMPANY" | "HEALTH_SYSTEM" {
  if (kind === "CONTACT") return "CONTACT";
  if (kind === "COMPANY") return "COMPANY";
  return "HEALTH_SYSTEM";
}

type CapturableEntityKind = "CONTACT" | "COMPANY" | "HEALTH_SYSTEM";

function buildEmailNoteBody(args: {
  message: NormalizedMessageMetadata;
  analystNote: string | null;
}) {
  const lines = [
    "[Email Capture]",
    `Subject: ${args.message.subject || "(No subject)"}`,
    `From: ${args.message.fromRaw || args.message.fromEmail || args.message.fromName || "Unknown sender"}`,
    `To: ${args.message.toRaw || ""}`,
    `Cc: ${args.message.ccRaw || ""}`,
    `Date: ${args.message.dateRaw || ""}`,
    `Gmail Message ID: ${args.message.messageId || ""}`,
    `Gmail Thread ID: ${args.message.threadId || ""}`,
    `Internet Message-ID: ${args.message.internetMessageId || ""}`
  ];

  if (args.analystNote) {
    lines.push("", `Analyst Note: ${args.analystNote}`);
  }

  if (args.message.snippet) {
    lines.push("", `Snippet: ${args.message.snippet}`);
  }

  return lines.join("\n").trim();
}

async function hasExistingMessageCapture(
  entityKind: CapturableEntityKind,
  entityId: string,
  messageId: string
) {
  const existing = await prisma.externalMessageCapture.findUnique({
    where: {
      provider_externalMessageId_entityKind_entityId: {
        provider: "GMAIL",
        externalMessageId: messageId,
        entityKind,
        entityId
      }
    },
    select: { id: true }
  });

  return Boolean(existing);
}

async function persistMessageCapture(args: {
  entityKind: CapturableEntityKind;
  entityId: string;
  message: NormalizedMessageMetadata;
  noteId: string;
  actorId: string;
}) {
  if (!args.message.messageId) return false;

  try {
    await prisma.externalMessageCapture.create({
      data: {
        provider: "GMAIL",
        externalMessageId: args.message.messageId,
        threadId: args.message.threadId || null,
        internetMessageId: args.message.internetMessageId || null,
        entityKind: args.entityKind,
        entityId: args.entityId,
        noteId: args.noteId,
        capturedByUserId: args.actorId
      }
    });

    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

async function attachSingleEntityNote(args: {
  actor: AddonActor;
  message: NormalizedMessageMetadata;
  entityKind: CapturableEntityKind;
  entityId: string;
  analystNote: string | null;
  affiliations?: EntityNoteAffiliation[];
}) {
  if (!args.message.messageId) {
    throw new Error("Cannot attach note without Gmail message id");
  }

  const alreadyExists = await hasExistingMessageCapture(args.entityKind, args.entityId, args.message.messageId);
  if (alreadyExists) {
    return { created: false, duplicated: true };
  }

  const noteText = buildEmailNoteBody({
    message: args.message,
    analystNote: args.analystNote
  });

  const note = await createEntityNote(args.entityKind, args.entityId, {
    note: noteText,
    affiliations: args.affiliations,
    createdByUserId: args.actor.id,
    createdByName: args.actor.name || args.actor.email
  });

  const captureSaved = await persistMessageCapture({
    entityKind: args.entityKind,
    entityId: args.entityId,
    message: args.message,
    noteId: note.id,
    actorId: args.actor.id
  });

  if (!captureSaved) {
    await prisma.entityNote.deleteMany({
      where: {
        id: note.id,
        entityKind: args.entityKind,
        entityId: args.entityId
      }
    });
    return { created: false, duplicated: true };
  }

  return { created: true, duplicated: false };
}

function dedupeAffiliations(values: EntityNoteAffiliation[]) {
  return Array.from(new Map(values.map((entry) => [`${entry.kind}:${entry.id}`, entry] as const)).values());
}

async function attachOpportunityNote(args: {
  actor: AddonActor;
  message: NormalizedMessageMetadata;
  opportunityId: string;
  analystNote: string | null;
}) {
  const opportunity = await prisma.companyOpportunity.findUnique({
    where: { id: args.opportunityId },
    select: {
      id: true,
      title: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true
        }
      },
      healthSystem: {
        select: {
          id: true,
          name: true
        }
      },
      contacts: {
        include: {
          contact: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (!opportunity) {
    throw new Error("Opportunity not found for note attachment");
  }

  const affiliations: EntityNoteAffiliation[] = [
    {
      kind: "company",
      id: opportunity.company.id,
      label: opportunity.company.name
    },
    {
      kind: "opportunity",
      id: opportunity.id,
      label: opportunity.title
    }
  ];

  if (opportunity.healthSystem) {
    affiliations.push({
      kind: "healthSystem",
      id: opportunity.healthSystem.id,
      label: opportunity.healthSystem.name
    });
  }

  for (const link of opportunity.contacts) {
    affiliations.push({
      kind: "contact",
      id: link.contact.id,
      label: link.contact.name
    });
  }

  const normalizedAffiliations = dedupeAffiliations(affiliations);

  const targets: Array<{ entityKind: "CONTACT" | "COMPANY" | "HEALTH_SYSTEM"; entityId: string }> = [
    { entityKind: "COMPANY", entityId: opportunity.company.id }
  ];

  if (opportunity.healthSystem) {
    targets.push({ entityKind: "HEALTH_SYSTEM", entityId: opportunity.healthSystem.id });
  }

  for (const link of opportunity.contacts) {
    targets.push({ entityKind: "CONTACT", entityId: link.contact.id });
  }

  const uniqueTargets = Array.from(
    new Map(targets.map((target) => [`${target.entityKind}:${target.entityId}`, target] as const)).values()
  );

  let createdCount = 0;
  let duplicateCount = 0;

  for (const target of uniqueTargets) {
    const result = await attachSingleEntityNote({
      actor: args.actor,
      message: args.message,
      entityKind: target.entityKind,
      entityId: target.entityId,
      analystNote: args.analystNote,
      affiliations: normalizedAffiliations
    });

    if (result.created) createdCount += 1;
    if (result.duplicated) duplicateCount += 1;
  }

  return {
    createdCount,
    duplicateCount
  };
}

export async function attachEmailAsNotes(args: {
  actor: AddonActor;
  event: GmailAddonEvent;
  message: NormalizedMessageMetadata;
}) {
  const analystNote = toNullableTrimmed(getFormValue(args.event, "notePrefix"));
  const rawTargets = getFormValues(args.event, "attachTargets");
  const parsedTargets = rawTargets.map(parseAttachTarget).filter((target): target is AttachTarget => Boolean(target));

  if (parsedTargets.length === 0) {
    throw new Error("Select at least one target to attach the email note.");
  }

  const dedupedTargets = Array.from(
    new Map(parsedTargets.map((target) => [`${target.kind}:${target.id}`, target] as const)).values()
  );

  let createdCount = 0;
  let duplicateCount = 0;

  for (const target of dedupedTargets) {
    if (target.kind === "OPPORTUNITY") {
      const result = await attachOpportunityNote({
        actor: args.actor,
        message: args.message,
        opportunityId: target.id,
        analystNote
      });
      createdCount += result.createdCount;
      duplicateCount += result.duplicateCount;
      continue;
    }

    const entityKind = toEntityKind(target.kind);
    const result = await attachSingleEntityNote({
      actor: args.actor,
      message: args.message,
      entityKind,
      entityId: target.id,
      analystNote
    });

    if (result.created) createdCount += 1;
    if (result.duplicated) duplicateCount += 1;
  }

  return {
    createdCount,
    duplicateCount
  };
}

export async function createContactFromForm(args: {
  actor: AddonActor;
  event: GmailAddonEvent;
}) {
  const name = toNullableTrimmed(getFormValue(args.event, "contactName"));
  if (!name) {
    throw new Error("Contact name is required.");
  }

  const email = toNullableTrimmed(getFormValue(args.event, "contactEmail"));
  const title = toNullableTrimmed(getFormValue(args.event, "contactTitle"));
  const principalSelection = parsePrincipalSelection(getFormValue(args.event, "contactPrincipal"));

  const result = await prisma.$transaction(async (tx) => {
    const resolved = await resolveOrCreateContact(tx, {
      name,
      title,
      email
    });

    if (!principalSelection) {
      return {
        contactId: resolved.contact.id,
        contactName: resolved.contact.name,
        created: resolved.resolution.wasCreated
      };
    }

    if (principalSelection.kind === "HEALTH_SYSTEM") {
      const exists = await tx.healthSystem.findUnique({
        where: { id: principalSelection.id },
        select: { id: true }
      });
      if (!exists) {
        throw new Error("Selected principal health system was not found.");
      }

      await upsertHealthSystemContactLink(tx, {
        contactId: resolved.contact.id,
        healthSystemId: principalSelection.id,
        roleType: "EXECUTIVE",
        title
      });

      await tx.contact.update({
        where: { id: resolved.contact.id },
        data: {
          principalEntityType: "HEALTH_SYSTEM",
          principalEntityId: principalSelection.id
        }
      });
    }

    if (principalSelection.kind === "COMPANY") {
      const exists = await tx.company.findUnique({
        where: { id: principalSelection.id },
        select: { id: true }
      });
      if (!exists) {
        throw new Error("Selected principal company was not found.");
      }

      await upsertCompanyContactLink(tx, {
        contactId: resolved.contact.id,
        companyId: principalSelection.id,
        roleType: "COMPANY_CONTACT" as ContactRoleType,
        title
      });

      await tx.contact.update({
        where: { id: resolved.contact.id },
        data: {
          principalEntityType: "COMPANY",
          principalEntityId: principalSelection.id
        }
      });
    }

    return {
      contactId: resolved.contact.id,
      contactName: resolved.contact.name,
      created: resolved.resolution.wasCreated
    };
  });

  return result;
}

export async function createCompanyFromForm(event: GmailAddonEvent) {
  const name = toNullableTrimmed(getFormValue(event, "companyName"));
  if (!name) {
    throw new Error("Company name is required.");
  }

  const website = toNullableTrimmed(getFormValue(event, "companyWebsite"));
  const headquartersCity = toNullableTrimmed(getFormValue(event, "companyHeadquartersCity"));
  const headquartersState = toNullableTrimmed(getFormValue(event, "companyHeadquartersState"));
  const headquartersCountry = toNullableTrimmed(getFormValue(event, "companyHeadquartersCountry"));
  const companyTypeRaw = (getFormValue(event, "companyType") || "STARTUP").toUpperCase();
  const companyType =
    companyTypeRaw === "SPIN_OUT" || companyTypeRaw === "DENOVO" ? companyTypeRaw : "STARTUP";

  const created = await prisma.company.create({
    data: {
      name,
      website,
      headquartersCity,
      headquartersState,
      headquartersCountry,
      companyType,
      primaryCategory: "OTHER",
      leadSourceType: "OTHER",
      intakeStatus: "NOT_SCHEDULED",
      researchStatus: "DRAFT",
      researchUpdatedAt: new Date()
    },
    select: {
      id: true,
      name: true
    }
  });

  return created;
}

export async function createHealthSystemFromForm(event: GmailAddonEvent) {
  const name = toNullableTrimmed(getFormValue(event, "healthSystemName"));
  if (!name) {
    throw new Error("Health system name is required.");
  }

  const website = toNullableTrimmed(getFormValue(event, "healthSystemWebsite"));
  const headquartersCity = toNullableTrimmed(getFormValue(event, "healthSystemHeadquartersCity"));
  const headquartersState = toNullableTrimmed(getFormValue(event, "healthSystemHeadquartersState"));
  const headquartersCountry = toNullableTrimmed(getFormValue(event, "healthSystemHeadquartersCountry"));
  const isAllianceMember = isTruthyInput(getFormValue(event, "healthSystemAllianceMember"));

  const created = await prisma.healthSystem.create({
    data: {
      name,
      website,
      headquartersCity,
      headquartersState,
      headquartersCountry,
      isAllianceMember,
      isLimitedPartner: false,
      researchStatus: "DRAFT",
      researchUpdatedAt: new Date()
    },
    select: {
      id: true,
      name: true
    }
  });

  return created;
}

export async function createOpportunityFromForm(event: GmailAddonEvent) {
  const companyId = toNullableTrimmed(getFormValue(event, "opportunityCompanyId"));
  const title = toNullableTrimmed(getFormValue(event, "opportunityTitle"));
  const typeRaw = (getFormValue(event, "opportunityType") || "PROSPECT_PURSUIT").toUpperCase() as CompanyOpportunityType;
  const stageRaw = (getFormValue(event, "opportunityStage") || "IDENTIFIED").toUpperCase() as CompanyOpportunityStage;
  const healthSystemId = toNullableTrimmed(getFormValue(event, "opportunityHealthSystemId"));
  const notes = toNullableTrimmed(getFormValue(event, "opportunityNotes"));

  if (!companyId) {
    throw new Error("Company is required to create an opportunity.");
  }

  if (!title) {
    throw new Error("Opportunity title is required.");
  }

  const type = VALID_OPPORTUNITY_TYPES.has(typeRaw) ? typeRaw : "PROSPECT_PURSUIT";
  const stage = VALID_OPPORTUNITY_STAGES.has(stageRaw) ? stageRaw : "IDENTIFIED";

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true
    }
  });

  if (!company) {
    throw new Error("Selected company was not found.");
  }

  if (healthSystemId) {
    const healthSystem = await prisma.healthSystem.findUnique({
      where: { id: healthSystemId },
      select: { id: true }
    });

    if (!healthSystem) {
      throw new Error("Selected health system was not found.");
    }
  }

  const created = await prisma.companyOpportunity.create({
    data: {
      companyId,
      title,
      type,
      stage,
      healthSystemId,
      notes
    },
    select: {
      id: true,
      title: true,
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await prisma.healthSystemOpportunity.upsert({
    where: { id: created.id },
    update: {
      legacyCompanyOpportunityId: created.id,
      companyId,
      healthSystemId,
      type,
      title,
      stage,
      notes
    },
    create: {
      id: created.id,
      legacyCompanyOpportunityId: created.id,
      companyId,
      healthSystemId,
      type,
      title,
      stage,
      notes
    }
  });

  return created;
}

export async function loadOpportunityFormOptions(matches: MatchResults) {
  const matchedCompanyIds = matches.companies.map((company) => company.id);
  const matchedHealthSystemIds = matches.healthSystems.map((system) => system.id);

  const [matchedCompanies, fallbackCompanies, matchedHealthSystems, fallbackHealthSystems] = await Promise.all([
    matchedCompanyIds.length > 0
      ? prisma.company.findMany({
          where: { id: { in: matchedCompanyIds } },
          select: { id: true, name: true },
          take: 10
        })
      : Promise.resolve([]),
    prisma.company.findMany({
      where: matchedCompanyIds.length > 0 ? { id: { notIn: matchedCompanyIds } } : undefined,
      select: { id: true, name: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 10
    }),
    matchedHealthSystemIds.length > 0
      ? prisma.healthSystem.findMany({
          where: { id: { in: matchedHealthSystemIds } },
          select: { id: true, name: true },
          take: 10
        })
      : Promise.resolve([]),
    prisma.healthSystem.findMany({
      where: matchedHealthSystemIds.length > 0 ? { id: { notIn: matchedHealthSystemIds } } : undefined,
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }],
      take: 10
    })
  ]);

  const companyOptions = Array.from(
    new Map([...matchedCompanies, ...fallbackCompanies].map((entry) => [entry.id, entry] as const)).values()
  );

  const healthSystemOptions = Array.from(
    new Map([...matchedHealthSystems, ...fallbackHealthSystems].map((entry) => [entry.id, entry] as const)).values()
  );

  return {
    companyOptions,
    healthSystemOptions
  };
}
