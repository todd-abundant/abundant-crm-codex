import { NextResponse } from "next/server";
import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  resolveOrCreateContact,
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

const createContactSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional().nullable(),
  principalEntityType: principalEntityTypeSchema.optional().nullable(),
  principalEntityId: z.string().optional().nullable(),
  principalRoleType: contactRoleTypeSchema.optional(),
  principalRelationshipTitle: z.string().optional().nullable().or(z.literal(""))
});

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim();
    const healthSystemId = trimOrNull(url.searchParams.get("healthSystemId"));
    const entityTypeParam = trimOrNull(url.searchParams.get("entityType"));
    const entityId = trimOrNull(url.searchParams.get("entityId"));
    const principalEntityTypeParam = trimOrNull(url.searchParams.get("principalEntityType"));
    const principalEntityId = trimOrNull(url.searchParams.get("principalEntityId"));
    const filters: Prisma.ContactWhereInput[] = [];

    if (query) {
      const hasHealthSystemKeyword = /\b(health|hospital|system|provider)\b/i.test(query);
      const hasCoInvestorKeyword = /\b(co[\s-]?investor|coinvestor|investor|fund|vc)\b/i.test(query);
      const hasCompanyKeyword = /\b(company|startup|business)\b/i.test(query);
      const queryFilters: Prisma.ContactWhereInput[] = [
        { name: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
        {
          healthSystemLinks: {
            some: {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                {
                  healthSystem: {
                    name: { contains: query, mode: "insensitive" }
                  }
                }
              ]
            }
          }
        },
        {
          coInvestorLinks: {
            some: {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                {
                  coInvestor: {
                    name: { contains: query, mode: "insensitive" }
                  }
                }
              ]
            }
          }
        },
        {
          companyLinks: {
            some: {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                {
                  company: {
                    name: { contains: query, mode: "insensitive" }
                  }
                }
              ]
            }
          }
        }
      ];

      if (hasHealthSystemKeyword) {
        queryFilters.push({ healthSystemLinks: { some: {} } });
        queryFilters.push({ principalEntityType: "HEALTH_SYSTEM" });
      }

      if (hasCoInvestorKeyword) {
        queryFilters.push({ coInvestorLinks: { some: {} } });
        queryFilters.push({ principalEntityType: "CO_INVESTOR" });
      }

      if (hasCompanyKeyword) {
        queryFilters.push({ companyLinks: { some: {} } });
        queryFilters.push({ principalEntityType: "COMPANY" });
      }

      filters.push({
        OR: queryFilters
      });
    }

    if (healthSystemId) {
      filters.push({
        healthSystemLinks: {
          some: { healthSystemId }
        }
      });
    }

    if (entityTypeParam || entityId) {
      if (!entityTypeParam) {
        return NextResponse.json({ error: "Entity type is required when filtering by entity id." }, { status: 400 });
      }

      const parsedEntityType = principalEntityTypeSchema.safeParse(entityTypeParam);
      if (!parsedEntityType.success) {
        return NextResponse.json({ error: "Invalid entity type filter." }, { status: 400 });
      }

      if (parsedEntityType.data === "HEALTH_SYSTEM") {
        filters.push({
          healthSystemLinks: {
            some: entityId ? { healthSystemId: entityId } : {}
          }
        });
      } else if (parsedEntityType.data === "CO_INVESTOR") {
        filters.push({
          coInvestorLinks: {
            some: entityId ? { coInvestorId: entityId } : {}
          }
        });
      } else {
        filters.push({
          companyLinks: {
            some: entityId ? { companyId: entityId } : {}
          }
        });
      }
    }

    if (principalEntityTypeParam) {
      const parsedPrincipalType = principalEntityTypeSchema.safeParse(principalEntityTypeParam);
      if (!parsedPrincipalType.success) {
        return NextResponse.json({ error: "Invalid principal entity type filter." }, { status: 400 });
      }

      filters.push({
        principalEntityType: parsedPrincipalType.data
      });
    }

    if (principalEntityId) {
      filters.push({
        principalEntityId
      });
    }

    const contacts = await prisma.contact.findMany({
      where: filters.length > 0 ? { AND: filters } : undefined,
      include: contactRecordInclude,
      orderBy: [{ name: "asc" }, { createdAt: "desc" }]
    });

    const contentCounts = await loadContactEntityContentCounts(contacts.map((contact) => contact.id));

    return NextResponse.json({
      contacts: contacts.map((contact) => mapContactRecord(contact, contentCounts.get(contact.id)))
    });
  } catch (error) {
    console.error("list_contacts_error", error);
    return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = createContactSchema.parse(await request.json());
    const shouldSetPrincipal = input.principalEntityType !== undefined || input.principalEntityId !== undefined;

    const result = await prisma.$transaction(async (tx) => {
      const resolved = await resolveOrCreateContact(tx, {
        name: input.name,
        title: trimOrNull(input.title),
        email: trimOrNull(input.email),
        phone: trimOrNull(input.phone),
        linkedinUrl: trimOrNull(input.linkedinUrl)
      });

      const contactUpdateData: Prisma.ContactUpdateInput = {};
      if (input.notes !== undefined) {
        contactUpdateData.notes = trimOrNull(input.notes);
      }

      if (shouldSetPrincipal) {
        const principalEntity = await applyPrincipalEntity(tx, resolved.contact.id, {
          principalEntityType: input.principalEntityType,
          principalEntityId: input.principalEntityId,
          principalRoleType: input.principalRoleType,
          principalRelationshipTitle: input.principalRelationshipTitle
        });
        contactUpdateData.principalEntityType = principalEntity.principalEntityType;
        contactUpdateData.principalEntityId = principalEntity.principalEntityId;
      }

      if (Object.keys(contactUpdateData).length > 0) {
        await tx.contact.update({
          where: { id: resolved.contact.id },
          data: contactUpdateData
        });
      }

      const contact = await tx.contact.findUnique({
        where: { id: resolved.contact.id },
        include: contactRecordInclude
      });

      if (!contact) {
        throw new Error("Contact not found after save");
      }

      return { resolved, contact };
    });

    const contentCounts = await loadContactEntityContentCounts([result.contact.id]);

    return NextResponse.json(
      {
        contact: mapContactRecord(result.contact, contentCounts.get(result.contact.id)),
        resolution: result.resolved.resolution
      },
      { status: result.resolved.resolution.wasCreated ? 201 : 200 }
    );
  } catch (error) {
    console.error("create_contact_error", error);
    const message = error instanceof Error ? error.message : "Failed to create contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
