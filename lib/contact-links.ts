import { type ContactRoleType, type Prisma } from "@prisma/client";

type ContactAssociationInput = {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
  roleType: ContactRoleType;
  relationshipTitle?: string | null;
};

type NormalizedContactDraft = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
};

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value?: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function normalizeLinkedinUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/g, "");
    return `https://${host}${path || ""}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/g, "");
  }
}

function normalizeText(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContactDraft(input: ContactAssociationInput): NormalizedContactDraft | null {
  const name = trimOrNull(input.name);
  if (!name) return null;

  return {
    name,
    title: trimOrNull(input.title),
    email: normalizeEmail(input.email),
    phone: trimOrNull(input.phone),
    linkedinUrl: normalizeLinkedinUrl(input.linkedinUrl),
    notes: trimOrNull(input.notes)
  };
}

async function findExistingContact(
  tx: Prisma.TransactionClient,
  draft: NormalizedContactDraft
) {
  const identityFilters: Prisma.ContactWhereInput[] = [];

  if (draft.linkedinUrl) {
    identityFilters.push({ linkedinUrl: draft.linkedinUrl });
  }

  if (draft.email) {
    identityFilters.push({ email: draft.email });
  }

  if (identityFilters.length > 0) {
    const byIdentity = await tx.contact.findFirst({
      where: { OR: identityFilters },
      orderBy: { createdAt: "asc" }
    });

    if (byIdentity) {
      return byIdentity;
    }
  }

  const sameName = await tx.contact.findMany({
    where: { name: { equals: draft.name, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    take: 2
  });

  if (sameName.length === 1) {
    return sameName[0];
  }

  if (sameName.length > 1 && draft.title) {
    const titleMatch = sameName.find(
      (entry) => normalizeText(entry.title) === normalizeText(draft.title)
    );
    if (titleMatch) {
      return titleMatch;
    }
  }

  return null;
}

async function ensureContact(
  tx: Prisma.TransactionClient,
  input: ContactAssociationInput
) {
  const draft = normalizeContactDraft(input);
  if (!draft) return null;

  const existing = await findExistingContact(tx, draft);

  if (!existing) {
    return tx.contact.create({
      data: {
        name: draft.name,
        title: draft.title,
        email: draft.email,
        phone: draft.phone,
        linkedinUrl: draft.linkedinUrl,
        notes: draft.notes
      }
    });
  }

  const updateData: Prisma.ContactUpdateInput = {};

  if (!existing.title && draft.title) updateData.title = draft.title;
  if (!existing.email && draft.email) updateData.email = draft.email;
  if (!existing.phone && draft.phone) updateData.phone = draft.phone;
  if (!existing.linkedinUrl && draft.linkedinUrl) updateData.linkedinUrl = draft.linkedinUrl;
  if (!existing.notes && draft.notes) updateData.notes = draft.notes;

  if (Object.keys(updateData).length === 0) {
    return existing;
  }

  return tx.contact.update({
    where: { id: existing.id },
    data: updateData
  });
}

export async function replaceHealthSystemContactLinks(
  tx: Prisma.TransactionClient,
  healthSystemId: string,
  contacts: ContactAssociationInput[]
) {
  await tx.contactHealthSystem.deleteMany({ where: { healthSystemId } });

  for (const entry of contacts) {
    const contact = await ensureContact(tx, entry);
    if (!contact) continue;

    const linkTitle = trimOrNull(entry.relationshipTitle) ?? trimOrNull(entry.title);

    await tx.contactHealthSystem.upsert({
      where: {
        contactId_healthSystemId_roleType: {
          contactId: contact.id,
          healthSystemId,
          roleType: entry.roleType
        }
      },
      create: {
        contactId: contact.id,
        healthSystemId,
        roleType: entry.roleType,
        title: linkTitle
      },
      update: {
        title: linkTitle
      }
    });
  }
}

export async function replaceCoInvestorContactLinks(
  tx: Prisma.TransactionClient,
  coInvestorId: string,
  contacts: ContactAssociationInput[]
) {
  await tx.contactCoInvestor.deleteMany({ where: { coInvestorId } });

  for (const entry of contacts) {
    const contact = await ensureContact(tx, entry);
    if (!contact) continue;

    const linkTitle = trimOrNull(entry.relationshipTitle) ?? trimOrNull(entry.title);

    await tx.contactCoInvestor.upsert({
      where: {
        contactId_coInvestorId_roleType: {
          contactId: contact.id,
          coInvestorId,
          roleType: entry.roleType
        }
      },
      create: {
        contactId: contact.id,
        coInvestorId,
        roleType: entry.roleType,
        title: linkTitle
      },
      update: {
        title: linkTitle
      }
    });
  }
}

export async function replaceCompanyContactLinks(
  tx: Prisma.TransactionClient,
  companyId: string,
  contacts: ContactAssociationInput[]
) {
  await tx.contactCompany.deleteMany({ where: { companyId } });

  for (const entry of contacts) {
    const contact = await ensureContact(tx, entry);
    if (!contact) continue;

    const linkTitle = trimOrNull(entry.relationshipTitle) ?? trimOrNull(entry.title);

    await tx.contactCompany.upsert({
      where: {
        contactId_companyId_roleType: {
          contactId: contact.id,
          companyId,
          roleType: entry.roleType
        }
      },
      create: {
        contactId: contact.id,
        companyId,
        roleType: entry.roleType,
        title: linkTitle
      },
      update: {
        title: linkTitle
      }
    });
  }
}
