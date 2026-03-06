import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createOpportunityLinkSchema = z.object({
  opportunityId: z.string().min(1),
  role: z.string().trim().max(120).optional().nullable().or(z.literal(""))
});

const updateOpportunityLinkSchema = z.object({
  linkId: z.string().min(1),
  role: z.string().trim().max(120).optional().nullable().or(z.literal(""))
});

const deleteOpportunityLinkSchema = z.object({
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
    const { id: contactId } = await context.params;
    const input = createOpportunityLinkSchema.parse(await request.json());

    const link = await prisma.$transaction(async (tx) => {
      const [contact, opportunity] = await Promise.all([
        tx.contact.findUnique({
          where: { id: contactId },
          select: { id: true }
        }),
        tx.companyOpportunity.findUnique({
          where: { id: input.opportunityId },
          select: { id: true }
        })
      ]);

      if (!contact) {
        throw new Error("Contact not found");
      }

      if (!opportunity) {
        throw new Error("Opportunity not found");
      }

      return tx.companyOpportunityContact.upsert({
        where: {
          opportunityId_contactId: {
            opportunityId: input.opportunityId,
            contactId
          }
        },
        update: {
          role: trimOrNull(input.role)
        },
        create: {
          opportunityId: input.opportunityId,
          contactId,
          role: trimOrNull(input.role)
        },
        include: {
          opportunity: {
            select: {
              id: true,
              title: true,
              type: true,
              stage: true,
              estimatedCloseDate: true,
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
              }
            }
          }
        }
      });
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("create_contact_opportunity_link_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add opportunity link" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await context.params;
    const input = updateOpportunityLinkSchema.parse(await request.json());

    const link = await prisma.$transaction(async (tx) => {
      const existing = await tx.companyOpportunityContact.findUnique({
        where: { id: input.linkId },
        select: {
          id: true,
          contactId: true
        }
      });

      if (!existing || existing.contactId !== contactId) {
        throw new Error("Opportunity link not found");
      }

      return tx.companyOpportunityContact.update({
        where: { id: existing.id },
        data: {
          role: trimOrNull(input.role)
        },
        include: {
          opportunity: {
            select: {
              id: true,
              title: true,
              type: true,
              stage: true,
              estimatedCloseDate: true,
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
              }
            }
          }
        }
      });
    });

    return NextResponse.json({ link });
  } catch (error) {
    console.error("update_contact_opportunity_link_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update opportunity link" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await context.params;
    const input = deleteOpportunityLinkSchema.parse(await request.json());

    const removed = await prisma.companyOpportunityContact.deleteMany({
      where: {
        id: input.linkId,
        contactId
      }
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Opportunity link not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("delete_contact_opportunity_link_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove opportunity link" },
      { status: 400 }
    );
  }
}
