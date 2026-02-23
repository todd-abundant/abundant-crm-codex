import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  resolveOrCreateContact,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";

const postSchema = z
  .object({
    healthSystemId: z.string().min(1),
    contactId: z.string().min(1).optional(),
    attendanceStatus: z
      .enum(["INVITED", "ATTENDED", "DECLINED", "NO_SHOW"])
      .default("ATTENDED"),
    createContact: z
      .object({
        name: z.string().min(1),
        title: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        linkedinUrl: z.string().url().optional().or(z.literal(""))
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    if (!value.contactId && !value.createContact?.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide contactId or createContact."
      });
    }
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
    const body = await request.json();
    const input = postSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const [company, healthSystem] = await Promise.all([
        tx.company.findUnique({
          where: { id: companyId },
          select: { id: true }
        }),
        tx.healthSystem.findUnique({
          where: { id: input.healthSystemId },
          select: { id: true, name: true, isAllianceMember: true }
        })
      ]);

      if (!company) {
        throw new Error("Pipeline item not found");
      }

      if (!healthSystem || !healthSystem.isAllianceMember) {
        throw new Error("Alliance health system not found");
      }

      let contact = null as null | {
        id: string;
        name: string;
        title: string | null;
      };

      if (input.contactId) {
        const existing = await tx.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, name: true, title: true }
        });
        if (!existing) {
          throw new Error("Contact not found");
        }
        contact = existing;
      } else if (input.createContact) {
        const resolved = await resolveOrCreateContact(tx, {
          name: input.createContact.name,
          title: trimOrNull(input.createContact.title),
          email: trimOrNull(input.createContact.email),
          phone: trimOrNull(input.createContact.phone),
          linkedinUrl: trimOrNull(input.createContact.linkedinUrl)
        });
        contact = {
          id: resolved.contact.id,
          name: resolved.contact.name,
          title: resolved.contact.title
        };
      }

      if (!contact) {
        throw new Error("Contact not found");
      }

      await upsertHealthSystemContactLink(tx, {
        contactId: contact.id,
        healthSystemId: input.healthSystemId,
        roleType: "EXECUTIVE",
        title: contact.title
      });

      const eventTitle = `Alliance Screening - ${healthSystem.name}`;
      const screeningEvent =
        (await tx.companyScreeningEvent.findFirst({
          where: {
            companyId,
            type: "INDIVIDUAL_SESSION",
            title: eventTitle
          },
          orderBy: [{ createdAt: "asc" }]
        })) ||
        (await tx.companyScreeningEvent.create({
          data: {
            companyId,
            type: "INDIVIDUAL_SESSION",
            title: eventTitle
          }
        }));

      const existingParticipant = await tx.companyScreeningParticipant.findFirst({
        where: {
          healthSystemId: input.healthSystemId,
          contactId: contact.id,
          screeningEvent: {
            companyId
          }
        },
        include: {
          contact: {
            select: { id: true, name: true, title: true }
          },
          screeningEvent: {
            select: {
              id: true,
              title: true,
              type: true,
              scheduledAt: true,
              completedAt: true
            }
          }
        }
      });

      const participant = existingParticipant
        ? await tx.companyScreeningParticipant.update({
            where: { id: existingParticipant.id },
            data: {
              attendanceStatus: input.attendanceStatus
            },
            include: {
              contact: {
                select: { id: true, name: true, title: true }
              },
              screeningEvent: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  scheduledAt: true,
                  completedAt: true
                }
              }
            }
          })
        : await tx.companyScreeningParticipant.create({
            data: {
              screeningEventId: screeningEvent.id,
              healthSystemId: input.healthSystemId,
              contactId: contact.id,
              attendanceStatus: input.attendanceStatus
            },
            include: {
              contact: {
                select: { id: true, name: true, title: true }
              },
              screeningEvent: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  scheduledAt: true,
                  completedAt: true
                }
              }
            }
          });

      return {
        participant: {
          id: participant.id,
          contactId: participant.contactId,
          contactName: participant.contact?.name || "Individual not linked",
          contactTitle: participant.contact?.title || null,
          attendanceStatus: participant.attendanceStatus,
          eventId: participant.screeningEvent.id,
          eventTitle: participant.screeningEvent.title,
          eventType: participant.screeningEvent.type,
          eventScheduledAt: participant.screeningEvent.scheduledAt,
          eventCompletedAt: participant.screeningEvent.completedAt,
          notes: participant.notes
        }
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("add_screening_attendee_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add screening attendee." },
      { status: 400 }
    );
  }
}
