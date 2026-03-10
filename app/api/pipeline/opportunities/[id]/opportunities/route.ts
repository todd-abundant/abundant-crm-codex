import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseDateInput } from "@/lib/date-parse";
import { generateOpportunityTitle } from "@/lib/opportunity-title";

const opportunityTypeSchema = z.enum([
  "SCREENING_LOI",
  "VENTURE_STUDIO_SERVICES",
  "S1_TERM_SHEET",
  "COMMERCIAL_CONTRACT",
  "PROSPECT_PURSUIT"
]);

const opportunityStageSchema = z.enum([
  "IDENTIFIED",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "LEGAL",
  "CLOSED_WON",
  "CLOSED_LOST",
  "ON_HOLD"
]);

const createSchema = z.object({
  type: opportunityTypeSchema,
  healthSystemId: z.string().optional().nullable().or(z.literal("")),
  stage: opportunityStageSchema.default("IDENTIFIED"),
  likelihoodPercent: z.number().int().min(0).max(100).optional().nullable(),
  contractPriceUsd: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  nextSteps: z.string().max(10000).optional().nullable(),
  closeReason: z.string().max(2000).optional().nullable(),
  estimatedCloseDate: z.string().optional().nullable(),
  closedAt: z.string().optional().nullable()
});

const updateSchema = createSchema.partial().extend({
  opportunityId: z.string().min(1)
});

const deleteSchema = z.object({
  opportunityId: z.string().min(1)
});

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toNullableDate(value?: string | null) {
  return parseDateInput(value);
}

function toNumber(value: { toString(): string } | null) {
  return value ? Number(value.toString()) : null;
}

function computeDurationDays(createdAt: Date, closedAt: Date | null) {
  const startMs = createdAt.getTime();
  const endMs = (closedAt || new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function isClosedStage(stage: z.infer<typeof opportunityStageSchema>) {
  return stage === "CLOSED_WON" || stage === "CLOSED_LOST";
}

function ensureCloseReason(stage: z.infer<typeof opportunityStageSchema>, closeReason: string | null) {
  if (isClosedStage(stage) && !closeReason) {
    throw new Error("Close reason is required when marking an opportunity won or lost.");
  }
}

const includeOpportunity = {
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
          name: true,
          title: true,
          email: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" as const }]
  }
};

function toPayload(opportunity: {
  id: string;
  title: string;
  type: string;
  stage: string;
  contractPriceUsd: { toString(): string } | null;
  likelihoodPercent: number | null;
  nextSteps: string | null;
  notes: string | null;
  closeReason: string | null;
  createdAt: Date;
  estimatedCloseDate: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
  healthSystem: { id: string; name: string } | null;
  contacts: Array<{
    id: string;
    role: string | null;
    createdAt: Date;
    contact: {
      id: string;
      name: string;
      title: string | null;
      email: string | null;
    };
  }>;
}) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    type: opportunity.type,
    stage: opportunity.stage,
    contractPriceUsd: toNumber(opportunity.contractPriceUsd),
    durationDays: computeDurationDays(opportunity.createdAt, opportunity.closedAt),
    likelihoodPercent: opportunity.likelihoodPercent,
    nextSteps: opportunity.nextSteps,
    notes: opportunity.notes,
    closeReason: opportunity.closeReason,
    createdAt: opportunity.createdAt,
    estimatedCloseDate: opportunity.estimatedCloseDate,
    closedAt: opportunity.closedAt,
    updatedAt: opportunity.updatedAt,
    healthSystem: opportunity.healthSystem,
    contacts: opportunity.contacts
  };
}

async function validateHealthSystemContactLinks(
  healthSystemId: string,
  contactIds: string[]
) {
  if (!healthSystemId || contactIds.length === 0) return;
  const allowed = await prisma.contactHealthSystem.findMany({
    where: {
      healthSystemId,
      contactId: { in: contactIds }
    },
    select: {
      contactId: true
    }
  });
  const allowedIds = new Set(allowed.map((entry) => entry.contactId));
  const invalidIds = contactIds.filter((contactId) => !allowedIds.has(contactId));
  if (invalidIds.length === 0) return;

  const invalidContacts = await prisma.contact.findMany({
    where: {
      id: { in: invalidIds }
    },
    select: {
      name: true
    },
    orderBy: [{ name: "asc" }]
  });

  const names = invalidContacts.map((entry) => entry.name).join(", ");
  throw new Error(
    `Cannot change the health system while linked opportunity contacts are not affiliated (${names || invalidIds.join(", ")}). Remove those contacts first.`
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const input = createSchema.parse(await request.json());

    const closeReason = trimOrNull(input.closeReason);
    ensureCloseReason(input.stage, closeReason);

    const created = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      });
      if (!company) {
        throw new Error("Pipeline item not found");
      }

      const healthSystemId = trimOrNull(input.healthSystemId);
      let healthSystemName: string | null = null;
      if (healthSystemId) {
        const healthSystem = await tx.healthSystem.findUnique({
          where: { id: healthSystemId },
          select: { id: true, name: true }
        });
        if (!healthSystem) {
          throw new Error("Health system not found");
        }
        healthSystemName = healthSystem.name;
      }

      const title = generateOpportunityTitle({
        companyName: company.name,
        healthSystemName,
        type: input.type
      });

      return tx.companyOpportunity.create({
        data: {
          companyId,
          type: input.type,
          title,
          healthSystemId,
          stage: input.stage,
          likelihoodPercent: input.likelihoodPercent ?? null,
          contractPriceUsd: input.contractPriceUsd ?? null,
          notes: trimOrNull(input.notes),
          nextSteps: trimOrNull(input.nextSteps),
          closeReason,
          estimatedCloseDate: toNullableDate(input.estimatedCloseDate),
          closedAt: isClosedStage(input.stage) ? toNullableDate(input.closedAt) || new Date() : null
        },
        include: includeOpportunity
      });
    });

    return NextResponse.json({ opportunity: toPayload(created) }, { status: 201 });
  } catch (error) {
    console.error("create_pipeline_company_opportunity_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create opportunity" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const input = updateSchema.parse(await request.json());

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.companyOpportunity.findFirst({
        where: {
          id: input.opportunityId,
          companyId
        },
        select: {
          id: true,
          type: true,
          stage: true,
          closeReason: true,
          closedAt: true,
          healthSystemId: true,
          company: {
            select: {
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
            select: {
              contactId: true
            }
          }
        }
      });

      if (!existing) {
        throw new Error("Opportunity not found");
      }

      const nextType = input.type ?? existing.type;
      const nextStage = input.stage ?? existing.stage;
      const nextCloseReason = Object.prototype.hasOwnProperty.call(input, "closeReason")
        ? trimOrNull(input.closeReason)
        : existing.closeReason;
      ensureCloseReason(nextStage, nextCloseReason);

      const nextHealthSystemId = Object.prototype.hasOwnProperty.call(input, "healthSystemId")
        ? trimOrNull(input.healthSystemId)
        : existing.healthSystemId;
      let nextHealthSystemName = existing.healthSystem?.name || null;

      if (nextHealthSystemId) {
        const healthSystem = await tx.healthSystem.findUnique({
          where: { id: nextHealthSystemId },
          select: { id: true, name: true }
        });
        if (!healthSystem) {
          throw new Error("Health system not found");
        }
        nextHealthSystemName = healthSystem.name;
      } else {
        nextHealthSystemName = null;
      }

      if (nextHealthSystemId && nextHealthSystemId !== existing.healthSystemId) {
        const contactIds = existing.contacts.map((entry) => entry.contactId);
        await validateHealthSystemContactLinks(nextHealthSystemId, contactIds);
      }

      const generatedTitle = generateOpportunityTitle({
        companyName: existing.company.name,
        healthSystemName: nextHealthSystemName,
        type: nextType
      });

      const updateData: {
        type?: z.infer<typeof opportunityTypeSchema>;
        title?: string;
        healthSystemId?: string | null;
        stage?: z.infer<typeof opportunityStageSchema>;
        likelihoodPercent?: number | null;
        contractPriceUsd?: number | null;
        notes?: string | null;
        nextSteps?: string | null;
        closeReason?: string | null;
        estimatedCloseDate?: Date | null;
        closedAt?: Date | null;
      } = {};

      if (input.type !== undefined) updateData.type = input.type;
      updateData.title = generatedTitle;
      if (Object.prototype.hasOwnProperty.call(input, "healthSystemId")) {
        updateData.healthSystemId = nextHealthSystemId;
      }
      if (input.stage !== undefined) updateData.stage = input.stage;
      if (Object.prototype.hasOwnProperty.call(input, "likelihoodPercent")) {
        updateData.likelihoodPercent = input.likelihoodPercent ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(input, "contractPriceUsd")) {
        updateData.contractPriceUsd = input.contractPriceUsd ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(input, "notes")) {
        updateData.notes = trimOrNull(input.notes);
      }
      if (Object.prototype.hasOwnProperty.call(input, "nextSteps")) {
        updateData.nextSteps = trimOrNull(input.nextSteps);
      }
      if (Object.prototype.hasOwnProperty.call(input, "closeReason")) {
        updateData.closeReason = nextCloseReason;
      }
      if (Object.prototype.hasOwnProperty.call(input, "estimatedCloseDate")) {
        updateData.estimatedCloseDate = toNullableDate(input.estimatedCloseDate);
      }
      if (Object.prototype.hasOwnProperty.call(input, "closedAt")) {
        updateData.closedAt = toNullableDate(input.closedAt);
      }

      if (input.stage !== undefined) {
        if (isClosedStage(nextStage)) {
          updateData.closedAt =
            Object.prototype.hasOwnProperty.call(input, "closedAt")
              ? toNullableDate(input.closedAt)
              : existing.closedAt;
          if (!updateData.closedAt) {
            updateData.closedAt = new Date();
          }
        } else if (!Object.prototype.hasOwnProperty.call(input, "closedAt")) {
          updateData.closedAt = null;
        }
      }

      return tx.companyOpportunity.update({
        where: {
          id: existing.id
        },
        data: updateData,
        include: includeOpportunity
      });
    });

    return NextResponse.json({ opportunity: toPayload(updated) });
  } catch (error) {
    console.error("update_pipeline_company_opportunity_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update opportunity" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const input = deleteSchema.parse(await request.json());

    const deleted = await prisma.companyOpportunity.deleteMany({
      where: {
        id: input.opportunityId,
        companyId
      }
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("delete_pipeline_company_opportunity_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete opportunity" },
      { status: 400 }
    );
  }
}
