import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { type EntityNoteAffiliation } from "@/lib/entity-record-content";

const noteCreateSchema = z.object({
  note: z.string().min(1),
  opportunityId: z.string().min(1).optional().nullable()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const body = await request.json();
    const input = noteCreateSchema.parse(body);
    const noteText = input.note.trim();

    if (!noteText) {
      return NextResponse.json({ error: "Enter a note before saving." }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      });
      if (!company) {
        throw new Error("Pipeline item not found");
      }

      const opportunity = input.opportunityId
        ? await tx.companyOpportunity.findFirst({
            where: {
              id: input.opportunityId,
              companyId
            },
            select: {
              id: true,
              title: true,
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
          })
        : null;

      if (input.opportunityId && !opportunity) {
        throw new Error("Opportunity not found");
      }

      const affiliations: EntityNoteAffiliation[] = [
        {
          kind: "company",
          id: company.id,
          label: company.name
        }
      ];

      if (opportunity) {
        affiliations.push({
          kind: "opportunity",
          id: opportunity.id,
          label: opportunity.title
        });
      }
      if (opportunity?.healthSystem) {
        affiliations.push({
          kind: "healthSystem",
          id: opportunity.healthSystem.id,
          label: opportunity.healthSystem.name
        });
      }

      const uniqueContactIds = new Set<string>();
      for (const link of opportunity?.contacts || []) {
        if (uniqueContactIds.has(link.contactId)) continue;
        uniqueContactIds.add(link.contactId);
        affiliations.push({
          kind: "contact",
          id: link.contact.id,
          label: link.contact.name
        });
      }

      const dedupedAffiliations = Array.from(
        new Map(affiliations.map((entry) => [`${entry.kind}:${entry.id}`, entry] as const)).values()
      );

      const targets: Array<{ entityKind: "COMPANY" | "HEALTH_SYSTEM" | "CONTACT"; entityId: string }> = [
        {
          entityKind: "COMPANY",
          entityId: company.id
        }
      ];

      if (opportunity?.healthSystem) {
        targets.push({
          entityKind: "HEALTH_SYSTEM",
          entityId: opportunity.healthSystem.id
        });
      }
      for (const contactId of uniqueContactIds) {
        targets.push({
          entityKind: "CONTACT",
          entityId: contactId
        });
      }

      const createdNotes = await Promise.all(
        targets.map((target) =>
          tx.entityNote.create({
            data: {
              entityKind: target.entityKind,
              entityId: target.entityId,
              note: noteText,
              affiliations: dedupedAffiliations,
              createdByUserId: user?.id || null,
              createdByName: user?.name || user?.email || null
            },
            select: {
              id: true,
              note: true,
              affiliations: true,
              createdAt: true,
              createdByName: true,
              createdByUser: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          })
        )
      );

      const companyNote = createdNotes[0];
      const noteCount = await tx.entityNote.count({
        where: {
          entityKind: "COMPANY",
          entityId: company.id
        }
      });

      return {
        companyNote,
        noteCount,
        propagatedCount: Math.max(0, targets.length - 1)
      };
    });

    return NextResponse.json(
      {
        note: {
          id: result.companyNote.id,
          note: result.companyNote.note,
          affiliations: Array.isArray(result.companyNote.affiliations)
            ? result.companyNote.affiliations
            : [],
          createdAt: result.companyNote.createdAt,
          createdByName:
            result.companyNote.createdByName ||
            result.companyNote.createdByUser?.name ||
            result.companyNote.createdByUser?.email ||
            "Unknown user"
        },
        noteCount: result.noteCount,
        propagatedCount: result.propagatedCount
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("create_pipeline_note_error", error);
    const message = error instanceof Error ? error.message : "Failed to add pipeline note";
    const statusCode =
      message === "Pipeline item not found" || message === "Opportunity not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
