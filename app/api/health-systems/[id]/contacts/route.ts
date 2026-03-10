import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  resolveOrCreateContact,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";

const requestSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  relationshipTitle: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  isKeyAllianceContact: z.boolean().optional(),
  isInformedAllianceContact: z.boolean().optional(),
  roleType: z
    .enum(["EXECUTIVE", "VENTURE_PARTNER", "INVESTOR_PARTNER", "COMPANY_CONTACT", "OTHER"])
    .default("EXECUTIVE")
});

const patchRequestSchema = z.object({
  linkId: z.string().min(1),
  name: z.string().optional(),
  title: z.string().optional(),
  relationshipTitle: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  isKeyAllianceContact: z.boolean().optional(),
  isInformedAllianceContact: z.boolean().optional(),
  roleType: z
    .enum(["EXECUTIVE", "VENTURE_PARTNER", "INVESTOR_PARTNER", "COMPANY_CONTACT", "OTHER"])
    .optional()
});

const deleteRequestSchema = z.object({
  linkId: z.string().min(1)
});

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatRequestError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const firstField = String(firstIssue?.path?.[0] || "");
    if (firstField === "name") {
      return "Contact name is required.";
    }
    if (firstField === "email") {
      return "Enter a valid email address or leave it blank.";
    }
    if (firstField === "linkedinUrl") {
      return "Enter a valid LinkedIn URL or leave it blank.";
    }
    return "Please correct the highlighted contact fields and try again.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function buildContactUpdatePayload(input: z.infer<typeof patchRequestSchema>) {
  const name = trimOrNull(input.name);
  if (input.name !== undefined && name === null) {
    throw new Error("Contact name cannot be blank.");
  }

  const title = trimOrNull(input.title);
  const relationshipTitle = trimOrNull(input.relationshipTitle);
  const email = trimOrNull(input.email);
  const phone = trimOrNull(input.phone);
  const linkedinUrl = trimOrNull(input.linkedinUrl);

  const contactUpdate: Prisma.ContactUpdateInput = {};
  const linkUpdate: Prisma.ContactHealthSystemUpdateInput = {};

  if (name !== null) {
    contactUpdate.name = name;
  }

  if (title !== null || input.title !== undefined) {
    contactUpdate.title = title;
  }

  if (email !== null || input.email !== undefined) {
    contactUpdate.email = email;
  }

  if (phone !== null || input.phone !== undefined) {
    contactUpdate.phone = phone;
  }

  if (linkedinUrl !== null || input.linkedinUrl !== undefined) {
    contactUpdate.linkedinUrl = linkedinUrl;
  }

  if (input.roleType !== undefined) {
    linkUpdate.roleType = input.roleType;
  }

  if (input.title !== undefined || input.relationshipTitle !== undefined) {
    linkUpdate.title = relationshipTitle || title || null;
  }

  if (typeof input.isKeyAllianceContact === "boolean") {
    linkUpdate.isKeyAllianceContact = input.isKeyAllianceContact;
  }

  if (typeof input.isInformedAllianceContact === "boolean") {
    linkUpdate.isInformedAllianceContact = input.isInformedAllianceContact;
  }

  return {
    contactUpdate,
    linkUpdate
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: healthSystemId } = await context.params;
    const body = await request.json();
    const input = requestSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const healthSystem = await tx.healthSystem.findUnique({
        where: { id: healthSystemId },
        select: { id: true, name: true }
      });

      if (!healthSystem) {
        throw new Error("Health system not found");
      }

      const resolved = await resolveOrCreateContact(tx, {
        name: input.name,
        title: trimOrNull(input.title),
        relationshipTitle: trimOrNull(input.relationshipTitle),
        email: trimOrNull(input.email),
        phone: trimOrNull(input.phone),
        linkedinUrl: trimOrNull(input.linkedinUrl)
      });

      const link = await upsertHealthSystemContactLink(tx, {
        contactId: resolved.contact.id,
        healthSystemId,
        roleType: input.roleType,
        title: trimOrNull(input.relationshipTitle) || trimOrNull(input.title),
        isKeyAllianceContact: input.isKeyAllianceContact ?? false,
        isInformedAllianceContact: input.isInformedAllianceContact ?? false
      });

      return { healthSystem, resolved, link };
    });

    return NextResponse.json({
      linked: true,
      healthSystem: result.healthSystem,
      contact: result.resolved.contact,
      link: result.link,
      resolution: result.resolved.resolution
    });
  } catch (error) {
    console.error("health_system_add_contact_error", error);
    return NextResponse.json(
      { error: formatRequestError(error, "Failed to add health system contact") },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: healthSystemId } = await context.params;
    const body = await request.json();
    const input = patchRequestSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const link = await tx.contactHealthSystem.findUnique({
        where: { id: input.linkId },
        include: { contact: true }
      });

      if (!link || link.healthSystemId !== healthSystemId) {
        throw new Error("Contact link not found");
      }

      const { contactUpdate, linkUpdate } = buildContactUpdatePayload(input);
      if (Object.keys(contactUpdate).length === 0 && Object.keys(linkUpdate).length === 0) {
        throw new Error("No contact updates provided");
      }

      if (Object.keys(contactUpdate).length > 0) {
        await tx.contact.update({
          where: { id: link.contactId },
          data: contactUpdate
        });
      }

      if (Object.keys(linkUpdate).length > 0) {
        await tx.contactHealthSystem.update({
          where: { id: link.id },
          data: linkUpdate
        });
      }

      return tx.contactHealthSystem.findUnique({
        where: { id: link.id },
        include: { contact: true }
      });
    });

    if (!result) {
      throw new Error("Failed to update contact");
    }

    return NextResponse.json({
      ok: true,
      link: result
    });
  } catch (error) {
    console.error("health_system_update_contact_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update health system contact" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: healthSystemId } = await context.params;
    const body = await request.json();
    const input = deleteRequestSchema.parse(body);

    const removed = await prisma.contactHealthSystem.deleteMany({
      where: {
        id: input.linkId,
        healthSystemId
      }
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Contact link not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("health_system_delete_contact_error", error);
    return NextResponse.json({ error: "Failed to delete health system contact" }, { status: 400 });
  }
}
