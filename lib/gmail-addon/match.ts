import { prisma } from "@/lib/db";
import { inferMessageEntityDefaults } from "@/lib/gmail-addon/inference";
import {
  emptyMatchResults,
  type MatchCandidate,
  type MatchResults,
  type NormalizedMessageMetadata,
  type OpportunityMatchCandidate,
  type OrganizationMatchCandidate,
  type OrganizationMatchKind
} from "@/lib/gmail-addon/types";

const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me"
]);

const DOMAIN_SUFFIX_TOKENS = [
  "healthcare",
  "health",
  "technologies",
  "technology",
  "ventures",
  "venture",
  "capital",
  "partners",
  "partner",
  "investments",
  "investment",
  "medical",
  "systems",
  "system",
  "services",
  "labs",
  "bio",
  "tech",
  "fund",
  "vc"
];

type ScoredMatchCandidate = MatchCandidate & {
  score: number;
};

type ScoredOrganizationCandidate = OrganizationMatchCandidate & {
  score: number;
};

type ScoredOpportunityMatchCandidate = OpportunityMatchCandidate & {
  score: number;
};

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function toDomainFromEmail(email: string) {
  const normalized = normalizeText(email);
  const at = normalized.indexOf("@");
  if (at < 0) return "";
  return normalized.slice(at + 1);
}

function isOrganizationDomain(domain: string) {
  return Boolean(domain) && !CONSUMER_EMAIL_DOMAINS.has(domain);
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

function domainsMatch(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
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

function formatCoInvestorProfile(isSeedInvestor: boolean, isSeriesAInvestor: boolean) {
  const parts = [];
  if (isSeedInvestor) parts.push("Seed investor");
  if (isSeriesAInvestor) parts.push("Series A investor");
  return parts.join(" · ");
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

  return Array.from(new Set(tokens)).slice(0, 6);
}

function domainTokens(domain: string) {
  if (!domain) return [];

  const firstLabel = domain.split(".")[0]?.trim().toLowerCase() || "";
  if (!firstLabel) return [];

  const tokens = new Set<string>();
  if (firstLabel.length >= 4) tokens.add(firstLabel);

  for (const suffix of DOMAIN_SUFFIX_TOKENS) {
    if (!firstLabel.endsWith(suffix)) continue;
    const trimmed = firstLabel.slice(0, -suffix.length).trim();
    if (trimmed.length >= 4) {
      tokens.add(trimmed);
    }
  }

  return Array.from(tokens).slice(0, 4);
}

function nameTokenMatchScore(name: string, tokens: string[]) {
  const normalized = normalizeText(name);
  if (!normalized || tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (normalized.includes(token)) {
      score += token.length >= 6 ? 12 : 8;
    }
  }

  return score;
}

function organizationNameHintScore(name: string, hintedName: string | null) {
  const normalizedName = normalizeText(name);
  const normalizedHint = normalizeText(hintedName);
  if (!normalizedName || !normalizedHint) return 0;
  if (normalizedName === normalizedHint) return 25;
  if (normalizedName.includes(normalizedHint) || normalizedHint.includes(normalizedName)) return 14;
  return 0;
}

function organizationTypeHeuristicScore(kind: OrganizationMatchKind, name: string, senderDomain: string) {
  const normalized = `${normalizeText(name)} ${senderDomain}`;

  if (kind === "CO_INVESTOR" && /\b(capital|ventures|venture|fund|vc|invest)\b/.test(normalized)) {
    return 8;
  }

  if (kind === "HEALTH_SYSTEM" && /\b(health|hospital|clinic|medical|care)\b/.test(normalized)) {
    return 8;
  }

  if (kind === "COMPANY" && /\b(tech|software|ai|bio|labs|platform)\b/.test(normalized)) {
    return 4;
  }

  return 0;
}

function toPlainMatch<T extends MatchCandidate>(candidate: T): MatchCandidate {
  return {
    id: candidate.id,
    label: candidate.label,
    subtitle: candidate.subtitle,
    confidence: candidate.confidence
  };
}

function topIfLikely<T extends ScoredMatchCandidate>(candidates: T[]): MatchCandidate | null {
  const top = candidates[0];
  if (!top || top.score < 60) return null;
  return toPlainMatch(top);
}

function topOrganizationIfLikely(candidates: ScoredOrganizationCandidate[]): OrganizationMatchCandidate | null {
  const top = candidates[0];
  if (!top || top.score < 60) return null;
  return {
    id: top.id,
    kind: top.kind,
    label: top.label,
    subtitle: top.subtitle,
    confidence: top.confidence
  };
}

function buildOrganizationWhere(args: {
  organizationDomain: string;
  relatedIds: string[];
  nameTokens: string[];
}) {
  return [
    ...(args.organizationDomain
      ? [{ website: { contains: args.organizationDomain, mode: "insensitive" as const } }]
      : []),
    ...args.nameTokens.map((token) => ({ name: { contains: token, mode: "insensitive" as const } })),
    ...(args.relatedIds.length > 0 ? [{ id: { in: args.relatedIds } }] : [])
  ];
}

export async function findMatchesForMessage(message: NormalizedMessageMetadata): Promise<MatchResults> {
  const inference = inferMessageEntityDefaults(message);
  const senderEmail = normalizeText(message.fromEmail);
  const rawSenderName = normalizeText(message.fromName);
  const senderName = rawSenderName === "unknown sender" ? "" : rawSenderName;
  const senderDomain = toDomainFromEmail(senderEmail);
  const organizationDomain = isOrganizationDomain(senderDomain) ? senderDomain : "";
  const messageNameTokens = uniqueIds([
    ...subjectTokens(message.subject),
    ...domainTokens(organizationDomain),
    ...inference.organizationNameTokens
  ]);
  const hasSenderSignal = Boolean(senderEmail || senderName);
  const hasSignal =
    hasSenderSignal ||
    Boolean(organizationDomain) ||
    messageNameTokens.length > 0 ||
    Boolean(inference.organizationName);

  if (!hasSignal) {
    return emptyMatchResults();
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
      let score = 40;
      const contactEmail = normalizeText(contact.email);
      const contactName = normalizeText(contact.name);

      if (senderEmail && contactEmail && senderEmail === contactEmail) score += 65;
      if (senderName && contactName && senderName === contactName) score += 25;
      if (senderName && contactName.startsWith(senderName)) score += 10;
      if (organizationDomain && contactEmail && domainsMatch(toDomainFromEmail(contactEmail), organizationDomain)) {
        score += 10;
      }

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

  const trustedContactIds = contactScores.filter((contact) => contact.score >= 70).map((contact) => contact.id);

  const [contactCompanyLinks, contactHealthSystemLinks, contactCoInvestorLinks] =
    trustedContactIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.contactCompany.findMany({
            where: { contactId: { in: trustedContactIds } },
            select: { companyId: true }
          }),
          prisma.contactHealthSystem.findMany({
            where: { contactId: { in: trustedContactIds } },
            select: { healthSystemId: true }
          }),
          prisma.contactCoInvestor.findMany({
            where: { contactId: { in: trustedContactIds } },
            select: { coInvestorId: true }
          })
        ]);

  const principalCompanyIds = contactScores
    .filter((contact) => trustedContactIds.includes(contact.id))
    .filter((contact) => contact.principalEntityType === "COMPANY")
    .map((contact) => contact.principalEntityId);

  const principalHealthSystemIds = contactScores
    .filter((contact) => trustedContactIds.includes(contact.id))
    .filter((contact) => contact.principalEntityType === "HEALTH_SYSTEM")
    .map((contact) => contact.principalEntityId);

  const principalCoInvestorIds = contactScores
    .filter((contact) => trustedContactIds.includes(contact.id))
    .filter((contact) => contact.principalEntityType === "CO_INVESTOR")
    .map((contact) => contact.principalEntityId);

  const relatedCompanyIds = uniqueIds([...principalCompanyIds, ...contactCompanyLinks.map((link) => link.companyId)]);
  const relatedHealthSystemIds = uniqueIds([
    ...principalHealthSystemIds,
    ...contactHealthSystemLinks.map((link) => link.healthSystemId)
  ]);
  const relatedCoInvestorIds = uniqueIds([
    ...principalCoInvestorIds,
    ...contactCoInvestorLinks.map((link) => link.coInvestorId)
  ]);

  const companyWhere = buildOrganizationWhere({
    organizationDomain,
    relatedIds: relatedCompanyIds,
    nameTokens: messageNameTokens
  });
  const healthSystemWhere = buildOrganizationWhere({
    organizationDomain,
    relatedIds: relatedHealthSystemIds,
    nameTokens: messageNameTokens
  });
  const coInvestorWhere = buildOrganizationWhere({
    organizationDomain,
    relatedIds: relatedCoInvestorIds,
    nameTokens: messageNameTokens
  });

  const opportunityWhere = [
    ...messageNameTokens.map((token) => ({ title: { contains: token, mode: "insensitive" as const } })),
    ...(relatedCompanyIds.length > 0 ? [{ companyId: { in: relatedCompanyIds } }] : []),
    ...(relatedHealthSystemIds.length > 0 ? [{ healthSystemId: { in: relatedHealthSystemIds } }] : []),
    ...(trustedContactIds.length > 0
      ? [
          {
            contacts: {
              some: {
                contactId: {
                  in: trustedContactIds
                }
              }
            }
          }
        ]
      : [])
  ];

  const [companyCandidates, healthSystemCandidates, coInvestorCandidates, opportunityCandidates] = await Promise.all([
    companyWhere.length === 0
      ? Promise.resolve([])
      : prisma.company.findMany({
          where: { OR: companyWhere },
          select: {
            id: true,
            name: true,
            website: true,
            headquartersCity: true,
            headquartersState: true,
            pipeline: {
              select: {
                phase: true
              }
            }
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
            headquartersState: true,
            isAllianceMember: true
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20
        }),
    coInvestorWhere.length === 0
      ? Promise.resolve([])
      : prisma.coInvestor.findMany({
          where: { OR: coInvestorWhere },
          select: {
            id: true,
            name: true,
            website: true,
            headquartersCity: true,
            headquartersState: true,
            isSeedInvestor: true,
            isSeriesAInvestor: true
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20
        }),
    opportunityWhere.length === 0
      ? Promise.resolve([])
      : prisma.companyOpportunity.findMany({
          where: { OR: opportunityWhere },
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
    .map<ScoredMatchCandidate>(({ id, label, subtitle, confidence, score }) => ({
      id,
      label,
      subtitle,
      confidence,
      score
    }));

  const companiesRanked = companyCandidates
    .map<ScoredOrganizationCandidate>((company) => {
      let score = 25;
      const domain = normalizeWebsiteDomain(company.website);

      if (organizationDomain && domainsMatch(organizationDomain, domain)) score += 60;
      if (messageNameTokens.length > 0) score += nameTokenMatchScore(company.name, messageNameTokens);
      score += organizationNameHintScore(company.name, inference.organizationName);
      if (relatedCompanyIds.includes(company.id)) score += 50;
      score += organizationTypeHeuristicScore("COMPANY", company.name, organizationDomain);
      if (inference.suggestedEntityKind === "COMPANY") score += 8;

      const subtitleParts = [];
      const pipelinePhase = formatEnumLabel(company.pipeline?.phase);
      if (pipelinePhase) subtitleParts.push(`Pipeline: ${pipelinePhase}`);
      const location = formatLocation(company.headquartersCity, company.headquartersState);
      if (location) subtitleParts.push(location);

      return {
        id: company.id,
        kind: "COMPANY",
        label: company.name,
        subtitle: subtitleParts.join(" · ") || null,
        confidence: confidenceFromScore(score),
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const healthSystemsRanked = healthSystemCandidates
    .map<ScoredOrganizationCandidate>((system) => {
      let score = 25;
      const domain = normalizeWebsiteDomain(system.website);

      if (organizationDomain && domainsMatch(organizationDomain, domain)) score += 60;
      if (messageNameTokens.length > 0) score += nameTokenMatchScore(system.name, messageNameTokens);
      score += organizationNameHintScore(system.name, inference.organizationName);
      if (relatedHealthSystemIds.includes(system.id)) score += 50;
      score += organizationTypeHeuristicScore("HEALTH_SYSTEM", system.name, organizationDomain);
      if (inference.suggestedEntityKind === "HEALTH_SYSTEM") score += 8;

      const subtitleParts = [];
      if (system.isAllianceMember) subtitleParts.push("Alliance member");
      const location = formatLocation(system.headquartersCity, system.headquartersState);
      if (location) subtitleParts.push(location);

      return {
        id: system.id,
        kind: "HEALTH_SYSTEM",
        label: system.name,
        subtitle: subtitleParts.join(" · ") || null,
        confidence: confidenceFromScore(score),
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const coInvestorsRanked = coInvestorCandidates
    .map<ScoredOrganizationCandidate>((coInvestor) => {
      let score = 25;
      const domain = normalizeWebsiteDomain(coInvestor.website);

      if (organizationDomain && domainsMatch(organizationDomain, domain)) score += 60;
      if (messageNameTokens.length > 0) score += nameTokenMatchScore(coInvestor.name, messageNameTokens);
      score += organizationNameHintScore(coInvestor.name, inference.organizationName);
      if (relatedCoInvestorIds.includes(coInvestor.id)) score += 50;
      score += organizationTypeHeuristicScore("CO_INVESTOR", coInvestor.name, organizationDomain);
      if (inference.suggestedEntityKind === "CO_INVESTOR") score += 8;

      const subtitleParts = [];
      const profile = formatCoInvestorProfile(coInvestor.isSeedInvestor, coInvestor.isSeriesAInvestor);
      if (profile) subtitleParts.push(profile);
      const location = formatLocation(coInvestor.headquartersCity, coInvestor.headquartersState);
      if (location) subtitleParts.push(location);

      return {
        id: coInvestor.id,
        kind: "CO_INVESTOR",
        label: coInvestor.name,
        subtitle: subtitleParts.join(" · ") || null,
        confidence: confidenceFromScore(score),
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const opportunitiesRanked = opportunityCandidates
    .map<ScoredOpportunityMatchCandidate>((opportunity) => {
      const titleNorm = normalizeText(opportunity.title);
      const matchedTokenCount = messageNameTokens.filter((token) => titleNorm.includes(token)).length;
      let score = 25 + matchedTokenCount * 12;

      if (relatedCompanyIds.includes(opportunity.companyId)) score += 40;
      if (opportunity.healthSystemId && relatedHealthSystemIds.includes(opportunity.healthSystemId)) score += 20;
      if (opportunity.contacts.some((entry) => trustedContactIds.includes(entry.contactId))) score += 35;

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
    .slice(0, 5);

  const primaryContact = topIfLikely(contactsRanked);
  const primaryOrganization = topOrganizationIfLikely(
    [...companiesRanked, ...healthSystemsRanked, ...coInvestorsRanked].sort((a, b) => b.score - a.score)
  );

  const suggestedAttachTargets = uniqueIds([
    primaryContact ? `CONTACT:${primaryContact.id}` : null,
    primaryOrganization ? `${primaryOrganization.kind}:${primaryOrganization.id}` : null
  ]).map((value) => {
    const [kind, id] = value.split(":");
    return {
      kind: kind as MatchResults["suggestedAttachTargets"][number]["kind"],
      id
    };
  });

  return {
    contacts: contactsRanked.map(toPlainMatch),
    companies: companiesRanked.map(toPlainMatch),
    healthSystems: healthSystemsRanked.map(toPlainMatch),
    coInvestors: coInvestorsRanked.map(toPlainMatch),
    opportunities: opportunitiesRanked.map<OpportunityMatchCandidate>(({ id, label, subtitle, confidence, companyId }) => ({
      id,
      label,
      subtitle,
      confidence,
      companyId
    })),
    primaryContact,
    primaryOrganization,
    suggestedAttachTargets
  };
}
