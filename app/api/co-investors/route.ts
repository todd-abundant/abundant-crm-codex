import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { coInvestorInputSchema } from "@/lib/schemas";

export async function GET() {
  const coInvestors = await prisma.coInvestor.findMany({
    include: {
      partners: true,
      contactLinks: {
        include: { contact: true }
      },
      investments: true,
      researchJobs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ coInvestors });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = coInvestorInputSchema.parse(body);

    const created = await prisma.coInvestor.create({
      data: {
        name: input.name,
        legalName: input.legalName || null,
        website: input.website || null,
        headquartersCity: input.headquartersCity || null,
        headquartersState: input.headquartersState || null,
        headquartersCountry: input.headquartersCountry || null,
        isSeedInvestor: input.isSeedInvestor,
        isSeriesAInvestor: input.isSeriesAInvestor,
        investmentNotes: input.investmentNotes || null,
        researchStatus: "DRAFT",
        researchNotes: input.researchNotes || null,
        researchUpdatedAt: new Date(),
        partners: {
          create: input.partners.map((partner) => ({
            name: partner.name,
            title: partner.title || null,
            profileUrl: partner.url || null
          }))
        },
        investments: {
          create: input.investments.map((investment) => ({
            portfolioCompanyName: investment.portfolioCompanyName,
            investmentAmountUsd: investment.investmentAmountUsd ?? null,
            investmentDate: investment.investmentDate ? new Date(investment.investmentDate) : null,
            investmentStage: (investment as { investmentStage?: string | null }).investmentStage || null,
            leadPartnerName: (investment as { leadPartnerName?: string | null }).leadPartnerName || null,
            sourceUrl: (investment as { sourceUrl?: string | null }).sourceUrl || null
          }))
        }
      },
      include: {
        partners: true,
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

    return NextResponse.json({ coInvestor: created }, { status: 201 });
  } catch (error) {
    console.error("create_co_investor_error", error);
    return NextResponse.json({ error: "Failed to save co-investor" }, { status: 400 });
  }
}
