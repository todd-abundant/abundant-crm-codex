import { prisma } from "@/lib/db";
import {
  type MatchCandidate,
  type MatchResults,
  type NormalizedMessageMetadata,
  type OpportunityMatchCandidate
} from "@/lib/gmail-addon/types";

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function toDomainFromEmail(email: string) {
  const normalized = normalizeText(email);
  const at = normalized.indexOf("@");
  if (at < 0) return "";
  return normalized.slice(at + 1);
}

function normalizeWebsiteDomain(website: string | null | undefined) {
  const raw = normalizeText(website);
  if (!raw) return "";

  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*/, "");
  }
}

function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 90) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function formatLocation(city: string | null, state: string | null) {
  const parts = [city, state].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function subjectTokens(subject: string) {
  const tokens = subject
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

  return Array.from(new Set(tokens)).slice(0, 4);
}

export async function findMatchesForMessage(message: NormalizedMessageMetadata): Promise<MatchResults> {
  const senderEmail = normalizeText(message.fromEmail);
  const senderName = normalizeText(message.fromName);
  const senderDomain = toDomainFromEmail(senderEmail);
  const subjectTerms = subjectTokens(message.subject);
  const hasSenderSignal = Boolean(senderEmail || (senderName && senderName !== "unknown sender"));
  const hasSignal = hasSenderSignal || Boolean(senderDomain) || subjectTerms.length > 0;

  if (!hasSignal) {
    return {
      contacts: [],
      companies: [],
      healthSystems: [],
      opportunities: []
    };
  }

  const contactFilters = [
    ...(senderEmail ? [{ email: { equals: senderEmail, mode: "insensitive" as const } }] : []),
    ...(senderName
      ? [
          { name: { contains: senderName, mode: "insensitive" as const } },
          ...senderName
            .split(/\s+/)
            .filter((token) => token.length >= 3)
            .slice(0, 2)
            .map((token) => ({ name: { contains: token, mode: "insensitive" as const } }))
        ]
      : [])
  ];

  const companyFilters = [
    ...(senderDomain ? [{ website: { contains: senderDomain, mode: "insensitive" as const } }] : []),
    ...subjectTerms.map((token) => ({ name: { contains: token, mode: "insensitive" as const } }))
  ];

  const [contactCandidates, companyCandidates, healthSystemCandidates, opportunityCandidates] = await Promise.all([
    prisma.contact.findMany({
      where: contactFilters.length > 0 ? { OR: contactFilters } : undefined,
      select: {
        id: true,
        name: true,
        title: true,
        email: true
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 12
    }),
    prisma.company.findMany({
      where: companyFilters.length > 0 ? { OR: companyFilters } : undefined,
      select: {
        id: true,
        name: true,
        website: true,
        headquartersCity: true,
        headquartersState: true
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 12
    }),
    prisma.healthSystem.findMany({
      where: companyFilters.length > 0 ? { OR: companyFilters } : undefined,
      select: {
        id: true,
        name: true,
        website: true,
        headquartersCity: true,
        headquartersState: true
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 12
    }),
    subjectTerms.length === 0
      ? Promise.resolve([])
      : prisma.companyOpportunity.findMany({
          where: {
            OR: subjectTerms.map((token) => ({ title: { contains: token, mode: "insensitive" as const } }))
          },
          select: {
            id: true,
            title: true,
            stage: true,
            companyId: true,
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
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 12
        })
  ]);

  const contactsRanked = contactCandidates
    .map((contact) => {
      let score = 45;
      const contactEmail = normalizeText(contact.email);
      const contactName = normalizeText(contact.name);

      if (senderEmail && contactEmail && senderEmail === contactEmail) score += 60;
      if (senderName && contactName && senderName === contactName) score += 25;
      if (senderName && contactName.startsWith(senderName)) score += 10;

      return {
        id: contact.id,
        label: contact.name,
        subtitle: [contact.title, contact.email].filter(Boolean).join(" · ") || null,
        confidence: confidenceFromScore(score),
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map<MatchCandidate>(({ id, label, subtitle, confidence }) => ({
      id,
      label,
      subtitle,
      confidence
    }));

  const companiesRanked = companyCandidates
    .map((company) => {
      let score = 35;
      const domain = normalizeWebsiteDomain(company.website);
      if (senderDomain && domain && senderDomain === domain) score += 55;
      if (subjectTerms.some((token) => normalizeText(company.name).includes(token))) score += 15;

      return {
        id: company.id,
        label: company.name,
        subtitle: formatLocation(company.headquartersCity, company.headquartersState),
        confidence: confidenceFromScore(score),
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map<MatchCandidate>(({ id, label, subtitle, confidence }) => ({
      id,
      label,
      subtitle,
      confidence
    }));

  const healthSystemsRanked = healthSystemCandidates
    .map((system) => {
      let score = 35;
      const domain = normalizeWebsiteDomain(system.website);
      if (senderDomain && domain && senderDomain === domain) score += 55;
      if (subjectTerms.some((token) => normalizeText(system.name).includes(token))) score += 15;

      return {
        id: system.id,
        label: system.name,
        subtitle: formatLocation(system.headquartersCity, system.headquartersState),
        confidence: confidenceFromScore(score),
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map<MatchCandidate>(({ id, label, subtitle, confidence }) => ({
      id,
      label,
      subtitle,
      confidence
    }));

  const opportunitiesRanked = opportunityCandidates
    .map((opportunity) => {
      const titleNorm = normalizeText(opportunity.title);
      const matchedTokenCount = subjectTerms.filter((token) => titleNorm.includes(token)).length;
      const score = 40 + matchedTokenCount * 15;

      return {
        id: opportunity.id,
        label: opportunity.title,
        subtitle: `${opportunity.company.name} · ${opportunity.stage}`,
        confidence: confidenceFromScore(score),
        companyId: opportunity.companyId,
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map<OpportunityMatchCandidate>(({ id, label, subtitle, confidence, companyId }) => ({
      id,
      label,
      subtitle,
      confidence,
      companyId
    }));

  return {
    contacts: contactsRanked,
    companies: companiesRanked,
    healthSystems: healthSystemsRanked,
    opportunities: opportunitiesRanked
  };
}
