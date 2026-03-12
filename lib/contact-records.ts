import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const contactRecordInclude = {
  healthSystemLinks: {
    include: {
      healthSystem: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  coInvestorLinks: {
    include: {
      coInvestor: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  companyLinks: {
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  companyOpportunityContacts: {
    include: {
      opportunity: {
        select: {
          id: true,
          title: true,
          type: true,
          stage: true,
          estimatedCloseDate: true,
          closedAt: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              name: true,
              pipeline: {
                select: {
                  ownerName: true
                }
              }
            }
          },
          healthSystem: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.ContactInclude;

export type ContactRecordWithRelations = Prisma.ContactGetPayload<{
  include: typeof contactRecordInclude;
}>;

type ContactEntityContentCounts = {
  noteCount: number;
  documentCount: number;
};

export async function loadContactEntityContentCounts(contactIds: string[]) {
  const uniqueIds = Array.from(new Set(contactIds.map((id) => id.trim()).filter(Boolean)));
  const counts = new Map<string, ContactEntityContentCounts>();

  if (uniqueIds.length === 0) {
    return counts;
  }

  const [noteCounts, documentCounts] = await Promise.all([
    prisma.entityNote.groupBy({
      by: ["entityId"],
      where: {
        entityKind: "CONTACT",
        entityId: { in: uniqueIds }
      },
      _count: {
        _all: true
      }
    }),
    prisma.entityDocument.groupBy({
      by: ["entityId"],
      where: {
        entityKind: "CONTACT",
        entityId: { in: uniqueIds }
      },
      _count: {
        _all: true
      }
    })
  ]);

  for (const entry of noteCounts) {
    counts.set(entry.entityId, {
      noteCount: entry._count._all,
      documentCount: 0
    });
  }

  for (const entry of documentCounts) {
    const current = counts.get(entry.entityId);
    if (current) {
      current.documentCount = entry._count._all;
      continue;
    }

    counts.set(entry.entityId, {
      noteCount: 0,
      documentCount: entry._count._all
    });
  }

  return counts;
}

function compareByName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

function resolvePrincipalEntity(record: {
  principalEntityType: ContactRecordWithRelations["principalEntityType"];
  principalEntityId: string | null;
  healthSystemLinks: ContactRecordWithRelations["healthSystemLinks"];
  coInvestorLinks: ContactRecordWithRelations["coInvestorLinks"];
  companyLinks: ContactRecordWithRelations["companyLinks"];
}) {
  if (!record.principalEntityType || !record.principalEntityId) return null;

  if (record.principalEntityType === "HEALTH_SYSTEM") {
    const link = record.healthSystemLinks.find((entry) => entry.healthSystemId === record.principalEntityId);
    if (!link) return null;
    return {
      type: record.principalEntityType,
      id: link.healthSystem.id,
      name: link.healthSystem.name
    };
  }

  if (record.principalEntityType === "CO_INVESTOR") {
    const link = record.coInvestorLinks.find((entry) => entry.coInvestorId === record.principalEntityId);
    if (!link) return null;
    return {
      type: record.principalEntityType,
      id: link.coInvestor.id,
      name: link.coInvestor.name
    };
  }

  const link = record.companyLinks.find((entry) => entry.companyId === record.principalEntityId);
  if (!link) return null;
  return {
    type: record.principalEntityType,
    id: link.company.id,
    name: link.company.name
  };
}

export function mapContactRecord(
  record: ContactRecordWithRelations,
  contentCounts?: ContactEntityContentCounts
) {
  const healthSystemLinks = [...record.healthSystemLinks]
    .sort((a, b) => compareByName(a.healthSystem, b.healthSystem))
    .map((link) => ({
      id: link.id,
      roleType: link.roleType,
      title: link.title,
      isKeyAllianceContact: link.isKeyAllianceContact,
      isInformedAllianceContact: link.isInformedAllianceContact,
      healthSystemId: link.healthSystemId,
      healthSystem: link.healthSystem
    }));

  const coInvestorLinks = [...record.coInvestorLinks]
    .sort((a, b) => compareByName(a.coInvestor, b.coInvestor))
    .map((link) => ({
      id: link.id,
      roleType: link.roleType,
      title: link.title,
      coInvestorId: link.coInvestorId,
      coInvestor: link.coInvestor
    }));

  const companyLinks = [...record.companyLinks]
    .sort((a, b) => compareByName(a.company, b.company))
    .map((link) => ({
      id: link.id,
      roleType: link.roleType,
      title: link.title,
      companyId: link.companyId,
      company: link.company
    }));

  const opportunityLinks = [...record.companyOpportunityContacts]
    .sort((a, b) => {
      const companyComparison = a.opportunity.company.name.localeCompare(b.opportunity.company.name);
      if (companyComparison !== 0) return companyComparison;
      return a.opportunity.title.localeCompare(b.opportunity.title);
    })
    .map((link) => ({
      id: link.id,
      role: link.role,
      opportunity: {
        id: link.opportunity.id,
        title: link.opportunity.title,
        type: link.opportunity.type,
        stage: link.opportunity.stage,
        estimatedCloseDate: link.opportunity.estimatedCloseDate,
        closedAt: link.opportunity.closedAt,
        createdAt: link.opportunity.createdAt,
        ownerName: link.opportunity.company.pipeline?.ownerName || null,
        company: {
          id: link.opportunity.company.id,
          name: link.opportunity.company.name
        },
        healthSystem: link.opportunity.healthSystem
      }
    }));

  const principalEntity = resolvePrincipalEntity({
    principalEntityType: record.principalEntityType,
    principalEntityId: record.principalEntityId,
    healthSystemLinks: record.healthSystemLinks,
    coInvestorLinks: record.coInvestorLinks,
    companyLinks: record.companyLinks
  });

  return {
    id: record.id,
    name: record.name,
    title: record.title,
    email: record.email,
    phone: record.phone,
    linkedinUrl: record.linkedinUrl,
    notes: record.notes,
    principalEntityType: record.principalEntityType,
    principalEntityId: record.principalEntityId,
    principalEntity,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    healthSystemLinks,
    coInvestorLinks,
    companyLinks,
    opportunityLinks,
    noteCount: contentCounts?.noteCount || 0,
    documentCount: contentCounts?.documentCount || 0
  };
}
