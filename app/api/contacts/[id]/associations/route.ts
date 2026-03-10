import { NextResponse } from "next/server";
import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  upsertCompanyContactLink,
  upsertCoInvestorContactLink,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";

const associationTypeSchema = z.enum(["HEALTH_SYSTEM", "CO_INVESTOR", "COMPANY"]);
const roleTypeSchema = z.enum([
  "EXECUTIVE",
  "VENTURE_PARTNER",
  "INVESTOR_PARTNER",
  "COMPANY_CONTACT",
  "OTHER"
]);

const createAssociationSchema = z.object({
  associationType: associationTypeSchema,
  targetId: z.string().min(1),
  roleType: roleTypeSchema.optional(),
  title: z.string().optional().nullable().or(z.literal("")),
  isKeyAllianceContact: z.boolean().optional(),
  isInformedAllianceContact: z.boolean().optional()
});

const updateAssociationSchema = z.object({
  associationType: associationTypeSchema,
  linkId: z.string().min(1),
  roleType: roleTypeSchema.optional(),
  title: z.string().optional().nullable().or(z.literal("")),
  isKeyAllianceContact: z.boolean().optional(),
  isInformedAllianceContact: z.boolean().optional()
});

const deleteAssociationSchema = z.object({
  associationType: associationTypeSchema,
  linkId: z.string().min(1)
});

type AssociationType = z.infer<typeof associationTypeSchema>;
type ContactRoleType = z.infer<typeof roleTypeSchema>;

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function defaultRoleTypeForAssociation(associationType: AssociationType): ContactRoleType {
  if (associationType === "HEALTH_SYSTEM") return "EXECUTIVE";
  if (associationType === "CO_INVESTOR") return "INVESTOR_PARTNER";
  return "COMPANY_CONTACT";
}

async function ensureContactExists(tx: Prisma.TransactionClient, contactId: string) {
  const contact = await tx.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      principalEntityType: true,
      principalEntityId: true
    }
  });

  if (!contact) {
    throw new Error("Contact not found");
  }

  return contact;
}

async function createAssociation(
  tx: Prisma.TransactionClient,
  contactId: string,
  input: z.infer<typeof createAssociationSchema>
) {
  const roleType = input.roleType || defaultRoleTypeForAssociation(input.associationType);
  const title = trimOrNull(input.title);

  if (input.associationType === "HEALTH_SYSTEM") {
    const healthSystem = await tx.healthSystem.findUnique({
      where: { id: input.targetId },
      select: { id: true }
    });

    if (!healthSystem) {
      throw new Error("Health system not found");
    }

    const link = await upsertHealthSystemContactLink(tx, {
      contactId,
      healthSystemId: input.targetId,
      roleType,
      title,
      isKeyAllianceContact: input.isKeyAllianceContact ?? false,
      isInformedAllianceContact: input.isInformedAllianceContact ?? false
    });

    return {
      associationType: input.associationType,
      link: await tx.contactHealthSystem.findUnique({
        where: { id: link.id },
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    };
  }

  if (input.associationType === "CO_INVESTOR") {
    const coInvestor = await tx.coInvestor.findUnique({
      where: { id: input.targetId },
      select: { id: true }
    });

    if (!coInvestor) {
      throw new Error("Co-investor not found");
    }

    const link = await upsertCoInvestorContactLink(tx, {
      contactId,
      coInvestorId: input.targetId,
      roleType,
      title
    });

    return {
      associationType: input.associationType,
      link: await tx.contactCoInvestor.findUnique({
        where: { id: link.id },
        include: {
          coInvestor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    };
  }

  const company = await tx.company.findUnique({
    where: { id: input.targetId },
    select: { id: true }
  });

  if (!company) {
    throw new Error("Company not found");
  }

  const link = await upsertCompanyContactLink(tx, {
    contactId,
    companyId: input.targetId,
    roleType,
    title
  });

  return {
    associationType: input.associationType,
    link: await tx.contactCompany.findUnique({
      where: { id: link.id },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
  };
}

async function updateAssociation(
  tx: Prisma.TransactionClient,
  contactId: string,
  input: z.infer<typeof updateAssociationSchema>
) {
  if (input.associationType === "HEALTH_SYSTEM") {
    const existing = await tx.contactHealthSystem.findFirst({
      where: {
        id: input.linkId,
        contactId
      },
      select: {
        id: true,
        healthSystemId: true,
        roleType: true,
        title: true,
        isKeyAllianceContact: true,
        isInformedAllianceContact: true
      }
    });

    if (!existing) {
      throw new Error("Association not found");
    }

    const roleType = input.roleType || existing.roleType;
    const title = input.title === undefined ? existing.title : trimOrNull(input.title);
    const isKeyAllianceContact = input.isKeyAllianceContact ?? existing.isKeyAllianceContact;
    const isInformedAllianceContact = input.isInformedAllianceContact ?? existing.isInformedAllianceContact;
    let targetId = existing.id;

    if (roleType === existing.roleType) {
      await tx.contactHealthSystem.update({
        where: { id: existing.id },
        data: {
          title,
          isKeyAllianceContact,
          isInformedAllianceContact
        }
      });
    } else {
      const upserted = await upsertHealthSystemContactLink(tx, {
        contactId,
        healthSystemId: existing.healthSystemId,
        roleType,
        title,
        isKeyAllianceContact,
        isInformedAllianceContact
      });
      targetId = upserted.id;

      if (upserted.id !== existing.id) {
        await tx.contactHealthSystem.delete({
          where: { id: existing.id }
        });
      }
    }

    return {
      associationType: input.associationType,
      link: await tx.contactHealthSystem.findUnique({
        where: { id: targetId },
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    };
  }

  if (input.associationType === "CO_INVESTOR") {
    const existing = await tx.contactCoInvestor.findFirst({
      where: {
        id: input.linkId,
        contactId
      },
      select: {
        id: true,
        coInvestorId: true,
        roleType: true,
        title: true
      }
    });

    if (!existing) {
      throw new Error("Association not found");
    }

    const roleType = input.roleType || existing.roleType;
    const title = input.title === undefined ? existing.title : trimOrNull(input.title);
    let targetId = existing.id;

    if (roleType === existing.roleType) {
      await tx.contactCoInvestor.update({
        where: { id: existing.id },
        data: { title }
      });
    } else {
      const upserted = await upsertCoInvestorContactLink(tx, {
        contactId,
        coInvestorId: existing.coInvestorId,
        roleType,
        title
      });
      targetId = upserted.id;

      if (upserted.id !== existing.id) {
        await tx.contactCoInvestor.delete({
          where: { id: existing.id }
        });
      }
    }

    return {
      associationType: input.associationType,
      link: await tx.contactCoInvestor.findUnique({
        where: { id: targetId },
        include: {
          coInvestor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    };
  }

  const existing = await tx.contactCompany.findFirst({
    where: {
      id: input.linkId,
      contactId
    },
    select: {
      id: true,
      companyId: true,
      roleType: true,
      title: true
    }
  });

  if (!existing) {
    throw new Error("Association not found");
  }

  const roleType = input.roleType || existing.roleType;
  const title = input.title === undefined ? existing.title : trimOrNull(input.title);
  let targetId = existing.id;

  if (roleType === existing.roleType) {
    await tx.contactCompany.update({
      where: { id: existing.id },
      data: { title }
    });
  } else {
    const upserted = await upsertCompanyContactLink(tx, {
      contactId,
      companyId: existing.companyId,
      roleType,
      title
    });
    targetId = upserted.id;

    if (upserted.id !== existing.id) {
      await tx.contactCompany.delete({
        where: { id: existing.id }
      });
    }
  }

  return {
    associationType: input.associationType,
    link: await tx.contactCompany.findUnique({
      where: { id: targetId },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await context.params;
    const input = createAssociationSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      await ensureContactExists(tx, contactId);
      return createAssociation(tx, contactId, input);
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("create_contact_association_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add contact association" },
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
    const input = updateAssociationSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      await ensureContactExists(tx, contactId);
      return updateAssociation(tx, contactId, input);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("update_contact_association_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update contact association" },
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
    const input = deleteAssociationSchema.parse(await request.json());

    const removed = await prisma.$transaction(async (tx): Promise<{ count: number }> => {
      const contact = await ensureContactExists(tx, contactId);

      if (input.associationType === "HEALTH_SYSTEM") {
        const existing = await tx.contactHealthSystem.findFirst({
          where: {
            id: input.linkId,
            contactId
          },
          select: {
            id: true,
            healthSystemId: true
          }
        });

        if (!existing) return { count: 0 };

        const deleted = await tx.contactHealthSystem.deleteMany({
          where: {
            id: input.linkId,
            contactId
          }
        });

        if (
          deleted.count > 0 &&
          contact.principalEntityType === "HEALTH_SYSTEM" &&
          contact.principalEntityId === existing.healthSystemId
        ) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              principalEntityType: null,
              principalEntityId: null
            }
          });
        }

        return deleted;
      }

      if (input.associationType === "CO_INVESTOR") {
        const existing = await tx.contactCoInvestor.findFirst({
          where: {
            id: input.linkId,
            contactId
          },
          select: {
            id: true,
            coInvestorId: true
          }
        });

        if (!existing) return { count: 0 };

        const deleted = await tx.contactCoInvestor.deleteMany({
          where: {
            id: input.linkId,
            contactId
          }
        });

        if (
          deleted.count > 0 &&
          contact.principalEntityType === "CO_INVESTOR" &&
          contact.principalEntityId === existing.coInvestorId
        ) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              principalEntityType: null,
              principalEntityId: null
            }
          });
        }

        return deleted;
      }

      const existing = await tx.contactCompany.findFirst({
        where: {
          id: input.linkId,
          contactId
        },
        select: {
          id: true,
          companyId: true
        }
      });

      if (!existing) return { count: 0 };

      const deleted = await tx.contactCompany.deleteMany({
        where: {
          id: input.linkId,
          contactId
        }
      });

      if (
        deleted.count > 0 &&
        contact.principalEntityType === "COMPANY" &&
        contact.principalEntityId === existing.companyId
      ) {
        await tx.contact.update({
          where: { id: contactId },
          data: {
            principalEntityType: null,
            principalEntityId: null
          }
        });
      }

      return deleted;
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Association not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("delete_contact_association_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete contact association" },
      { status: 400 }
    );
  }
}
