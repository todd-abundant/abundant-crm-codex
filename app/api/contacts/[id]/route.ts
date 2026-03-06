import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  upsertCompanyContactLink,
  upsertCoInvestorContactLink,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";
import {
  contactRecordInclude,
  loadContactEntityContentCounts,
  mapContactRecord
} from "@/lib/contact-records";

const principalEntityTypeSchema = z.enum(["HEALTH_SYSTEM", "CO_INVESTOR", "COMPANY"]);
const contactRoleTypeSchema = z.enum([
  "EXECUTIVE",
  "VENTURE_PARTNER",
  "INVESTOR_PARTNER",
  "COMPANY_CONTACT",
  "OTHER"
]);

const updateContactSchema = z
  .object({
    name: z.string().optional(),
    title: z.string().optional().nullable(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional().nullable(),
    linkedinUrl: z.string().url().optional().or(z.literal("")),
    notes: z.string().optional().nullable(),
    principalEntityType: principalEntityTypeSchema.optional().nullable(),
    principalEntityId: z.string().optional().nullable().or(z.literal("")),
    principalRoleType: contactRoleTypeSchema.optional(),
    principalRelationshipTitle: z.string().optional().nullable().or(z.literal(""))
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.title !== undefined ||
      value.email !== undefined ||
      value.phone !== undefined ||
      value.linkedinUrl !== undefined ||
      value.notes !== undefined ||
      value.principalEntityType !== undefined ||
      value.principalEntityId !== undefined ||
      value.principalRoleType !== undefined ||
      value.principalRelationshipTitle !== undefined,
    {
      message: "Provide at least one field to update"
    }
  );

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function defaultRoleTypeForPrincipal(
  principalEntityType: z.infer<typeof principalEntityTypeSchema>
): z.infer<typeof contactRoleTypeSchema> {
  if (principalEntityType === "HEALTH_SYSTEM") return "EXECUTIVE";
  if (principalEntityType === "CO_INVESTOR") return "INVESTOR_PARTNER";
  return "COMPANY_CONTACT";
}

async function applyPrincipalEntity(
  tx: Prisma.TransactionClient,
  contactId: string,
  input: {
    principalEntityType?: z.infer<typeof principalEntityTypeSchema> | null;
    principalEntityId?: string | null;
    principalRoleType?: z.infer<typeof contactRoleTypeSchema>;
    principalRelationshipTitle?: string | null;
  }
) {
  const principalEntityType = input.principalEntityType || null;
  const principalEntityId = trimOrNull(input.principalEntityId);
  const relationshipTitle = trimOrNull(input.principalRelationshipTitle);

  if (!principalEntityType && !principalEntityId) {
    return { principalEntityType: null, principalEntityId: null };
  }

  if (!principalEntityType || !principalEntityId) {
    throw new Error("Principal entity type and record are required together.");
  }

  const roleType = input.principalRoleType || defaultRoleTypeForPrincipal(principalEntityType);

  if (principalEntityType === "HEALTH_SYSTEM") {
    const target = await tx.healthSystem.findUnique({
      where: { id: principalEntityId },
      select: { id: true }
    });
    if (!target) {
      throw new Error("Principal health system not found");
    }

    await upsertHealthSystemContactLink(tx, {
      contactId,
      healthSystemId: principalEntityId,
      roleType,
      title: relationshipTitle
    });
  } else if (principalEntityType === "CO_INVESTOR") {
    const target = await tx.coInvestor.findUnique({
      where: { id: principalEntityId },
      select: { id: true }
    });
    if (!target) {
      throw new Error("Principal co-investor not found");
    }

    await upsertCoInvestorContactLink(tx, {
      contactId,
      coInvestorId: principalEntityId,
      roleType,
      title: relationshipTitle
    });
  } else {
    const target = await tx.company.findUnique({
      where: { id: principalEntityId },
      select: { id: true }
    });
    if (!target) {
      throw new Error("Principal company not found");
    }

    await upsertCompanyContactLink(tx, {
      contactId,
      companyId: principalEntityId,
      roleType,
      title: relationshipTitle
    });
  }

  return {
    principalEntityType,
    principalEntityId
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const contact = await prisma.contact.findUnique({
      where: { id },
      include: contactRecordInclude
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const contentCounts = await loadContactEntityContentCounts([contact.id]);

    return NextResponse.json({
      contact: mapContactRecord(contact, contentCounts.get(contact.id))
    });
  } catch (error) {
    console.error("get_contact_error", error);
    return NextResponse.json({ error: "Failed to load contact" }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const input = updateContactSchema.parse(await request.json());
    const shouldUpdatePrincipal =
      input.principalEntityType !== undefined ||
      input.principalEntityId !== undefined ||
      input.principalRoleType !== undefined ||
      input.principalRelationshipTitle !== undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.contact.findUnique({
        where: { id },
        select: {
          id: true,
          principalEntityType: true,
          principalEntityId: true
        }
      });

      if (!existing) {
        throw new Error("Contact not found");
      }

      const updateData: Prisma.ContactUpdateInput = {};

      if (input.name !== undefined) {
        const name = trimOrNull(input.name);
        if (!name) {
          throw new Error("Contact name is required");
        }

        updateData.name = name;
      }

      if (input.title !== undefined) {
        updateData.title = trimOrNull(input.title);
      }

      if (input.email !== undefined) {
        updateData.email = trimOrNull(input.email);
      }

      if (input.phone !== undefined) {
        updateData.phone = trimOrNull(input.phone);
      }

      if (input.linkedinUrl !== undefined) {
        updateData.linkedinUrl = trimOrNull(input.linkedinUrl);
      }

      if (input.notes !== undefined) {
        updateData.notes = trimOrNull(input.notes);
      }

      if (shouldUpdatePrincipal) {
        const principalEntity = await applyPrincipalEntity(tx, id, {
          principalEntityType: input.principalEntityType !== undefined ? input.principalEntityType : existing.principalEntityType,
          principalEntityId: input.principalEntityId !== undefined ? input.principalEntityId : existing.principalEntityId,
          principalRoleType: input.principalRoleType,
          principalRelationshipTitle: input.principalRelationshipTitle
        });
        updateData.principalEntityType = principalEntity.principalEntityType;
        updateData.principalEntityId = principalEntity.principalEntityId;
      }

      return tx.contact.update({
        where: { id },
        data: updateData,
        include: contactRecordInclude
      });
    });

    const contentCounts = await loadContactEntityContentCounts([updated.id]);

    return NextResponse.json({
      contact: mapContactRecord(updated, contentCounts.get(updated.id))
    });
  } catch (error) {
    console.error("update_contact_error", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "Contact not found") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update contact" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await prisma.contact.delete({
      where: { id }
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("delete_contact_error", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to delete contact" }, { status: 400 });
  }
}
