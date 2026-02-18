import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { healthSystemInputSchema } from "@/lib/schemas";

export async function GET() {
  const healthSystems = await prisma.healthSystem.findMany({
    include: {
      venturePartners: {
        include: {
          coInvestor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      contactLinks: {
        include: { contact: true }
      },
      investments: {
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      researchJobs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ healthSystems });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = healthSystemInputSchema.parse(body);

    const created = await prisma.healthSystem.create({
      data: {
        name: input.name,
        legalName: input.legalName || null,
        website: input.website || null,
        headquartersCity: input.headquartersCity || null,
        headquartersState: input.headquartersState || null,
        headquartersCountry: input.headquartersCountry || null,
        netPatientRevenueUsd: input.netPatientRevenueUsd ?? null,
        isLimitedPartner: input.isLimitedPartner,
        limitedPartnerInvestmentUsd: input.isLimitedPartner
          ? (input.limitedPartnerInvestmentUsd ?? null)
          : null,
        isAllianceMember: input.isAllianceMember,
        hasInnovationTeam: input.hasInnovationTeam ?? null,
        hasVentureTeam: input.hasVentureTeam ?? null,
        ventureTeamSummary: input.ventureTeamSummary || null,
        researchStatus: "DRAFT",
        researchNotes: input.researchNotes || null,
        researchUpdatedAt: new Date(),
        executives: {
          create: input.executives.map((e) => ({
            name: e.name,
            title: e.title || null,
            linkedinUrl: e.url || null
          }))
        },
        venturePartners: {
          create: input.venturePartners.map((p) => ({
            name: p.name,
            title: p.title || null,
            profileUrl: p.url || null
          }))
        },
        investments: {
          create: input.investments.map((i) => ({
            portfolioCompanyName: i.portfolioCompanyName,
            investmentAmountUsd: i.investmentAmountUsd ?? null,
            investmentDate: i.investmentDate ? new Date(i.investmentDate) : null,
            leadPartnerName: i.leadPartnerName || null,
            sourceUrl: i.sourceUrl || null
          }))
        }
      },
      include: {
        venturePartners: true,
        contactLinks: {
          include: { contact: true }
        },
        investments: true,
        researchJobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    return NextResponse.json({ healthSystem: created }, { status: 201 });
  } catch (error) {
    console.error("create_health_system_error", error);
    return NextResponse.json({ error: "Failed to save health system" }, { status: 400 });
  }
}
