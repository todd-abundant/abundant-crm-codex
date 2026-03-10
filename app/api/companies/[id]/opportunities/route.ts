import { NextResponse } from "next/server";
import { type CompanyOpportunityStage, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type OpportunitySummary = {
  id: string;
  title: string;
  type: string;
  stage: CompanyOpportunityStage;
  likelihoodPercent: number | null;
  contractPriceUsd: number | null;
  nextSteps: string | null;
  estimatedCloseDate: string | null;
  closedAt: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
  company: {
    id: string;
    name: string;
  };
  healthSystem: {
    id: string;
    name: string;
  } | null;
};

type OpportunityApiResponse = {
  opportunities: OpportunitySummary[];
};

const opportunityInclude = {
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
  },
  _count: {
    select: {
      contacts: true
    }
  }
} satisfies Prisma.CompanyOpportunityInclude;

function formatDateValue(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toNumber(value: { toString(): string } | null) {
  return value ? Number(value.toString()) : null;
}

function toPayload(opportunity: {
  id: string;
  title: string;
  type: string;
  stage: CompanyOpportunityStage;
  likelihoodPercent: number | null;
  contractPriceUsd: { toString(): string } | null;
  nextSteps: string | null;
  estimatedCloseDate: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company: {
    id: string;
    name: string;
  };
  healthSystem: {
    id: string;
    name: string;
  } | null;
  _count: {
    contacts: number;
  };
}): OpportunitySummary {
  return {
    id: opportunity.id,
    title: opportunity.title,
    type: opportunity.type,
    stage: opportunity.stage,
    likelihoodPercent: opportunity.likelihoodPercent,
    contractPriceUsd: toNumber(opportunity.contractPriceUsd),
    nextSteps: opportunity.nextSteps,
    estimatedCloseDate: formatDateValue(opportunity.estimatedCloseDate),
    closedAt: formatDateValue(opportunity.closedAt),
    contactCount: opportunity._count.contacts,
    createdAt: formatDateValue(opportunity.createdAt) as string,
    updatedAt: formatDateValue(opportunity.updatedAt) as string,
    company: opportunity.company,
    healthSystem: opportunity.healthSystem
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const opportunities = await prisma.companyOpportunity.findMany({
      where: {
        companyId: id
      },
      include: opportunityInclude,
      orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }]
    });

    const response: OpportunityApiResponse = {
      opportunities: opportunities.map((opportunity) => toPayload(opportunity))
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("list_company_opportunities_error", error);
    return NextResponse.json({ error: "Failed to load opportunities" }, { status: 400 });
  }
}
