import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const postSchema = z.object({
  opportunityId: z.string().min(1),
  contactId: z.string().min(1),
  role: z.string().trim().max(120).optional().nullable().or(z.literal(""))
});

const patchSchema = z.object({
  linkId: z.string().min(1),
  role: z.string().trim().max(120).optional().nullable().or(z.literal(""))
});

const deleteSchema = z.object({
  linkId: z.string().min(1)
});

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const input = postSchema.parse(await request.json());

    const link = await prisma.$transaction(async (tx) => {
      const [company, opportunity, contact] = await Promise.all([
        tx.company.findUnique({
          where: { id: companyId },
          select: { id: true }
        }),
        tx.companyOpportunity.findUnique({
          where: { id: input.opportunityId },
          select: {
            id: true,
            companyId: true,
            healthSystemId: true
          }
        }),
        tx.contact.findUnique({
          where: { id: input.contactId },
          select: {
            id: true,
            name: true,
            title: true,
            email: true
          }
        })
      ]);

      if (!company) {
        throw new Error("Pipeline item not found");
      }

      if (!opportunity || opportunity.companyId !== companyId) {
        throw new Error("Opportunity not found");
      }

      if (!contact) {
        throw new Error("Contact not found");
      }

      if (opportunity.healthSystemId) {
        const linkedToHealthSystem = await tx.contactHealthSystem.findFirst({
          where: {
            contactId: contact.id,
            healthSystemId: opportunity.healthSystemId
          },
          select: { id: true }
        });

        if (!linkedToHealthSystem) {
          throw new Error(
            "Contact must be linked to the opportunity's health system before it can be assigned."
          );
        }
      }

      return tx.companyOpportunityContact.upsert({
        where: {
          opportunityId_contactId: {
            opportunityId: opportunity.id,
            contactId: contact.id
          }
        },
        update: {
          role: trimOrNull(input.role)
        },
        create: {
          opportunityId: opportunity.id,
          contactId: contact.id,
          role: trimOrNull(input.role)
        },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              title: true,
              email: true
            }
          }
        }
      });
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("create_pipeline_opportunity_contact_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add opportunity contact" },
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
    const input = patchSchema.parse(await request.json());

    const link = await prisma.$transaction(async (tx) => {
      const existing = await tx.companyOpportunityContact.findUnique({
        where: { id: input.linkId },
        include: {
          opportunity: {
            select: {
              companyId: true
            }
          }
        }
      });

      if (!existing || existing.opportunity.companyId !== companyId) {
        throw new Error("Opportunity contact not found");
      }

      return tx.companyOpportunityContact.update({
        where: { id: existing.id },
        data: {
          role: trimOrNull(input.role)
        },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              title: true,
              email: true
            }
          }
        }
      });
    });

    return NextResponse.json({ link });
  } catch (error) {
    console.error("update_pipeline_opportunity_contact_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update opportunity contact" },
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

    const deleted = await prisma.companyOpportunityContact.deleteMany({
      where: {
        id: input.linkId,
        opportunity: {
          companyId
        }
      }
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Opportunity contact not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("delete_pipeline_opportunity_contact_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove opportunity contact" },
      { status: 400 }
    );
  }
}
