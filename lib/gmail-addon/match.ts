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

function formatEnumLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
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

  const contactCandidates =
    contactFilters.length === 0
      ? []
      : await prisma.contact.findMany({
          where: { OR: contactFilters },
          select: {
            id: true,
            name: true,
            title: true,
            email: true,
            principalEntityType: true,
            principalEntityId: true
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20
        });

  const contactScores = contactCandidates
    .map((contact) => {
      let score = 45;
      const contactEmail = normalizeText(contact.email);
      const contactName = normalizeText(contact.name);

      if (senderEmail && contactEmail && senderEmail === contactEmail) score += 60;
      if (senderName && contactName && senderName === contactName) score += 25;
      if (senderName && contactName.startsWith(senderName)) score += 10;
      if (senderDomain && toDomainFromEmail(contactEmail) === senderDomain) score += 10;

      return {
        id: contact.id,
        label: contact.name,
        subtitle: [contact.title, contact.email].filter(Boolean).join(" · ") || null,
        confidence: confidenceFromScore(score),
        score,
        principalEntityType: contact.principalEntityType,
        principalEntityId: contact.principalEntityId
      };
    })
    .sort((a, b) => b.score - a.score);

  const strongContactIds = contactScores.filter((contact) => contact.score >= 90).map((contact) => contact.id);

  const [contactCompanyLinks, contactHealthSystemLinks] =
    strongContactIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.contactCompany.findMany({
            where: {
              contactId: { in: strongContactIds }
            },
            select: {
              companyId: true
            }
          }),
          prisma.contactHealthSystem.findMany({
            where: {
              contactId: { in: strongContactIds }
            },
            select: {
              healthSystemId: true
            }
          })
        ]);

  const principalCompanyIds = contactScores
    .filter((contact) => strongContactIds.includes(contact.id))
    .filter((contact) => contact.principalEntityType === "COMPANY")
    .map((contact) => contact.principalEntityId);

  const principalHealthSystemIds = contactScores
    .filter((contact) => strongContactIds.includes(contact.id))
    .filter((contact) => contact.principalEntityType === "HEALTH_SYSTEM")
    .map((contact) => contact.principalEntityId);

  const relatedCompanyIds = uniqueIds([
    ...principalCompanyIds,
    ...contactCompanyLinks.map((link) => link.companyId)
  ]);
  const relatedHealthSystemIds = uniqueIds([
    ...principalHealthSystemIds,
    ...contactHealthSystemLinks.map((link) => link.healthSystemId)
  ]);

  const companyWhere = [
    ...companyFilters,
    ...(relatedCompanyIds.length > 0 ? [{ id: { in: relatedCompanyIds } }] : [])
  ];
  const healthSystemWhere = [
    ...companyFilters,
    ...(relatedHealthSystemIds.length > 0 ? [{ id: { in: relatedHealthSystemIds } }] : [])
  ];

  const opportunityWhere = [
    ...subjectTerms.map((token) => ({ title: { contains: token, mode: "insensitive" as const } })),
    ...(relatedCompanyIds.length > 0 ? [{ companyId: { in: relatedCompanyIds } }] : []),
    ...(relatedHealthSystemIds.length > 0 ? [{ healthSystemId: { in: relatedHealthSystemIds } }] : []),
    ...(strongContactIds.length > 0
      ? [
          {
            contacts: {
              some: {
                contactId: {
                  in: strongContactIds
                }
              }
            }
          }
        ]
      : [])
  ];

  const [companyCandidates, healthSystemCandidates, opportunityCandidates] = await Promise.all([
    companyWhere.length === 0
      ? Promise.resolve([])
      : prisma.company.findMany({
          where: { OR: companyWhere },
          select: {
            id: true,
            name: true,
            website: true,
            headquartersCity: true,
            headquartersState: true
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20
        }),
    healthSystemWhere.length === 0
      ? Promise.resolve([])
      : prisma.healthSystem.findMany({
          where: { OR: healthSystemWhere },
          select: {
            id: true,
            name: true,
            website: true,
            headquartersCity: true,
            headquartersState: true
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20
        }),
    opportunityWhere.length === 0
      ? Promise.resolve([])
      : prisma.companyOpportunity.findMany({
          where: {
            OR: opportunityWhere
          },
          select: {
            id: true,
            title: true,
            stage: true,
            companyId: true,
            healthSystemId: true,
            company: {
              select: {
                id: true,
                name: true,
                pipeline: {
                  select: {
                    phase: true
                  }
                }
              }
            },
            contacts: {
              select: {
                contactId: true
              }
            }
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20
        })
  ]);

  const contactsRanked = contactScores
    .slice(0, 5)
    .map<MatchCandidate>(({ id, label, subtitle, confidence }) => ({
      id,
      label,
      subtitle,
      confidence
    }));

  const companiesRanked = companyCandidates
    .map((company) => {
      let score = 30;
      const domain = normalizeWebsiteDomain(company.website);
      if (senderDomain && domain && senderDomain === domain) score += 55;
      if (subjectTerms.some((token) => normalizeText(company.name).includes(token))) score += 15;
      if (relatedCompanyIds.includes(company.id)) score += 45;

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
      let score = 30;
      const domain = normalizeWebsiteDomain(system.website);
      if (senderDomain && domain && senderDomain === domain) score += 55;
      if (subjectTerms.some((token) => normalizeText(system.name).includes(token))) score += 15;
      if (relatedHealthSystemIds.includes(system.id)) score += 45;

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
      let score = 25 + matchedTokenCount * 15;

      if (relatedCompanyIds.includes(opportunity.companyId)) score += 40;
      if (opportunity.healthSystemId && relatedHealthSystemIds.includes(opportunity.healthSystemId)) score += 20;
      if (opportunity.contacts.some((entry) => strongContactIds.includes(entry.contactId))) score += 35;

      const pipelinePhase = formatEnumLabel(opportunity.company.pipeline?.phase);
      const stageLabel = formatEnumLabel(opportunity.stage);
      const subtitleParts = [opportunity.company.name];
      if (pipelinePhase) subtitleParts.push(`Pipeline: ${pipelinePhase}`);
      else if (stageLabel) subtitleParts.push(stageLabel);

      return {
        id: opportunity.id,
        label: opportunity.title,
        subtitle: subtitleParts.join(" · "),
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
