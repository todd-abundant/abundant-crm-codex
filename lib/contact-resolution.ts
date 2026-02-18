import { type ContactRoleType, type Prisma } from "@prisma/client";

const nicknameGroups = [
  ["william", ["bill", "billy", "will", "willy", "liam"]],
  ["robert", ["bob", "bobby", "rob", "robbie"]],
  ["richard", ["rick", "ricky", "rich", "dick"]],
  ["margaret", ["maggie", "meg", "peggy"]],
  ["elizabeth", ["liz", "beth", "lizzie", "eliza"]],
  ["james", ["jim", "jimmy"]],
  ["joseph", ["joe", "joey"]],
  ["michael", ["mike", "mikey"]],
  ["andrew", ["andy", "drew"]],
  ["katherine", ["kate", "katie", "kathy", "kat"]],
  ["christopher", ["chris"]],
  ["daniel", ["dan", "danny"]],
  ["anthony", ["tony"]],
  ["steven", ["steve"]],
  ["thomas", ["tom", "tommy"]],
  ["alexander", ["alex", "xander"]],
  ["john", ["johnny", "jack"]],
  ["edward", ["ed", "eddie", "ted", "teddy"]]
] as const;

const nicknameMap = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of nicknameGroups) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(alias, canonical);
    }
  }
  return map;
})();

type ResolveContactInput = {
  name: string;
  title?: string | null;
  relationshipTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
};

type ResolveContactResult = {
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
  };
  resolution: {
    matchedBy: "created" | "email" | "linkedin" | "name";
    confidence: number;
    wasCreated: boolean;
  };
};

type ParsedName = {
  normalizedFull: string;
  firstName: string;
  lastName: string;
  canonicalFirstName: string;
};

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeForComparison(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeLinkedinUrl(value?: string | null): string | null {
  const trimmed = (value || "").trim();
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

function canonicalizeFirstName(name: string) {
  return nicknameMap.get(name) || name;
}

function parseName(input: string): ParsedName {
  const normalizedFull = normalizeForComparison(input);
  const parts = normalizedFull.split(" ").filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const canonicalFirstName = canonicalizeFirstName(firstName);

  return {
    normalizedFull,
    firstName,
    lastName,
    canonicalFirstName
  };
}

function scoreNameMatch(candidate: ParsedName, existingName: string | null | undefined): number {
  if (!existingName) return 0;

  const existing = parseName(existingName);
  if (!candidate.normalizedFull || !existing.normalizedFull) return 0;

  if (candidate.normalizedFull === existing.normalizedFull) {
    return 0.95;
  }

  const lastMatches =
    candidate.lastName &&
    existing.lastName &&
    candidate.lastName === existing.lastName;

  const firstMatches =
    candidate.firstName &&
    existing.firstName &&
    candidate.firstName === existing.firstName;

  const canonicalFirstMatches =
    candidate.canonicalFirstName &&
    existing.canonicalFirstName &&
    candidate.canonicalFirstName === existing.canonicalFirstName;

  const initialMatches =
    candidate.firstName &&
    existing.firstName &&
    candidate.firstName.charAt(0) === existing.firstName.charAt(0);

  if (lastMatches && firstMatches) return 0.93;
  if (lastMatches && canonicalFirstMatches) return 0.88;
  if (lastMatches && initialMatches) return 0.8;
  if (canonicalFirstMatches && candidate.lastName && !existing.lastName) return 0.74;
  if (canonicalFirstMatches) return 0.7;

  return 0;
}

function scoreTitleMatch(candidateTitle: string | null, existingTitle: string | null): number {
  const a = normalizeForComparison(candidateTitle);
  const b = normalizeForComparison(existingTitle);
  if (!a || !b) return 0;
  if (a === b) return 0.08;

  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  return ratio >= 0.5 ? 0.05 : 0;
}

function cleanInput(input: ResolveContactInput) {
  const name = trimOrNull(input.name) || "";
  const title = trimOrNull(input.title);
  const email = normalizeEmail(input.email);
  const phone = trimOrNull(input.phone);
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl);

  return {
    name,
    title,
    email,
    phone,
    linkedinUrl,
    relationshipTitle: trimOrNull(input.relationshipTitle)
  };
}

async function findExistingByIdentity(
  tx: Prisma.TransactionClient,
  email: string | null,
  linkedinUrl: string | null
) {
  if (linkedinUrl) {
    const linkedInMatch = await tx.contact.findFirst({
      where: { linkedinUrl }
    });

    if (linkedInMatch) {
      return { record: linkedInMatch, matchedBy: "linkedin" as const, confidence: 0.99 };
    }
  }

  if (email) {
    const emailMatch = await tx.contact.findFirst({
      where: { email }
    });

    if (emailMatch) {
      return { record: emailMatch, matchedBy: "email" as const, confidence: 0.99 };
    }
  }

  return null;
}

async function findExistingByName(
  tx: Prisma.TransactionClient,
  name: string,
  title: string | null
) {
  const parsed = parseName(name);
  if (!parsed.normalizedFull) return null;

  const candidatePool = await tx.contact.findMany({
    where: {
      OR: [
        { name: { equals: name, mode: "insensitive" } },
        ...(parsed.lastName ? [{ name: { contains: parsed.lastName, mode: "insensitive" as const } }] : []),
        { name: { contains: parsed.firstName, mode: "insensitive" } }
      ]
    },
    take: 50
  });

  let best: { record: (typeof candidatePool)[number]; score: number } | null = null;

  for (const candidate of candidatePool) {
    const nameScore = scoreNameMatch(parsed, candidate.name);
    if (nameScore <= 0) continue;

    const titleScore = scoreTitleMatch(title, candidate.title);
    const score = nameScore + titleScore;

    if (!best || score > best.score) {
      best = { record: candidate, score };
    }
  }

  if (!best || best.score < 0.75) {
    return null;
  }

  return {
    record: best.record,
    matchedBy: "name" as const,
    confidence: Math.min(0.95, Number(best.score.toFixed(2)))
  };
}

async function hydrateContact(
  tx: Prisma.TransactionClient,
  existingId: string,
  incoming: ReturnType<typeof cleanInput>
) {
  const current = await tx.contact.findUnique({
    where: { id: existingId }
  });

  if (!current) return null;

  const data: Prisma.ContactUpdateInput = {};
  if (!current.title && incoming.title) data.title = incoming.title;
  if (!current.email && incoming.email) data.email = incoming.email;
  if (!current.phone && incoming.phone) data.phone = incoming.phone;
  if (!current.linkedinUrl && incoming.linkedinUrl) data.linkedinUrl = incoming.linkedinUrl;

  if (Object.keys(data).length === 0) {
    return current;
  }

  return tx.contact.update({
    where: { id: existingId },
    data
  });
}

export async function resolveOrCreateContact(
  tx: Prisma.TransactionClient,
  input: ResolveContactInput
): Promise<ResolveContactResult> {
  const cleaned = cleanInput(input);
  if (!cleaned.name) {
    throw new Error("Contact name is required");
  }

  const identityMatch = await findExistingByIdentity(tx, cleaned.email, cleaned.linkedinUrl);
  if (identityMatch) {
    const hydrated = await hydrateContact(tx, identityMatch.record.id, cleaned);
    return {
      contact: {
        id: hydrated?.id || identityMatch.record.id,
        name: hydrated?.name || identityMatch.record.name,
        title: hydrated?.title || identityMatch.record.title,
        email: hydrated?.email || identityMatch.record.email,
        phone: hydrated?.phone || identityMatch.record.phone,
        linkedinUrl: hydrated?.linkedinUrl || identityMatch.record.linkedinUrl
      },
      resolution: {
        matchedBy: identityMatch.matchedBy,
        confidence: identityMatch.confidence,
        wasCreated: false
      }
    };
  }

  const nameMatch = await findExistingByName(tx, cleaned.name, cleaned.title);
  if (nameMatch) {
    const hydrated = await hydrateContact(tx, nameMatch.record.id, cleaned);
    return {
      contact: {
        id: hydrated?.id || nameMatch.record.id,
        name: hydrated?.name || nameMatch.record.name,
        title: hydrated?.title || nameMatch.record.title,
        email: hydrated?.email || nameMatch.record.email,
        phone: hydrated?.phone || nameMatch.record.phone,
        linkedinUrl: hydrated?.linkedinUrl || nameMatch.record.linkedinUrl
      },
      resolution: {
        matchedBy: nameMatch.matchedBy,
        confidence: nameMatch.confidence,
        wasCreated: false
      }
    };
  }

  const created = await tx.contact.create({
    data: {
      name: cleaned.name,
      title: cleaned.title,
      email: cleaned.email,
      phone: cleaned.phone,
      linkedinUrl: cleaned.linkedinUrl
    }
  });

  return {
    contact: {
      id: created.id,
      name: created.name,
      title: created.title,
      email: created.email,
      phone: created.phone,
      linkedinUrl: created.linkedinUrl
    },
    resolution: {
      matchedBy: "created",
      confidence: 1,
      wasCreated: true
    }
  };
}

export async function upsertHealthSystemContactLink(
  tx: Prisma.TransactionClient,
  params: {
    contactId: string;
    healthSystemId: string;
    roleType: ContactRoleType;
    title?: string | null;
  }
) {
  return tx.contactHealthSystem.upsert({
    where: {
      contactId_healthSystemId_roleType: {
        contactId: params.contactId,
        healthSystemId: params.healthSystemId,
        roleType: params.roleType
      }
    },
    create: {
      contactId: params.contactId,
      healthSystemId: params.healthSystemId,
      roleType: params.roleType,
      title: trimOrNull(params.title)
    },
    update: {
      title: trimOrNull(params.title)
    }
  });
}

export async function upsertCoInvestorContactLink(
  tx: Prisma.TransactionClient,
  params: {
    contactId: string;
    coInvestorId: string;
    roleType: ContactRoleType;
    title?: string | null;
  }
) {
  return tx.contactCoInvestor.upsert({
    where: {
      contactId_coInvestorId_roleType: {
        contactId: params.contactId,
        coInvestorId: params.coInvestorId,
        roleType: params.roleType
      }
    },
    create: {
      contactId: params.contactId,
      coInvestorId: params.coInvestorId,
      roleType: params.roleType,
      title: trimOrNull(params.title)
    },
    update: {
      title: trimOrNull(params.title)
    }
  });
}

export async function upsertCompanyContactLink(
  tx: Prisma.TransactionClient,
  params: {
    contactId: string;
    companyId: string;
    roleType: ContactRoleType;
    title?: string | null;
  }
) {
  return tx.contactCompany.upsert({
    where: {
      contactId_companyId_roleType: {
        contactId: params.contactId,
        companyId: params.companyId,
        roleType: params.roleType
      }
    },
    create: {
      contactId: params.contactId,
      companyId: params.companyId,
      roleType: params.roleType,
      title: trimOrNull(params.title)
    },
    update: {
      title: trimOrNull(params.title)
    }
  });
}
