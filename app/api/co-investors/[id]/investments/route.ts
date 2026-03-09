import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createRequestSchema = z.object({
  companyId: z.string().min(1)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coInvestorId } = await context.params;
    const body = await request.json();
    const input = createRequestSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const [coInvestor, company] = await Promise.all([
        tx.coInvestor.findUnique({
          where: { id: coInvestorId },
          select: { id: true }
        }),
        tx.company.findUnique({
          where: { id: input.companyId },
          select: { id: true, name: true }
        })
      ]);

      if (!coInvestor) {
        throw new Error("Co-investor not found");
      }
      if (!company) {
        throw new Error("Company not found");
      }

      const existing = await tx.coInvestorInvestment.findFirst({
        where: {
          coInvestorId,
          portfolioCompanyName: company.name
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing) {
        return { created: false as const, investment: existing };
      }

      const investment = await tx.coInvestorInvestment.create({
        data: {
          coInvestorId,
          portfolioCompanyName: company.name
        }
      });

      return { created: true as const, investment };
    });

    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("co_investor_add_investment_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add co-investor investment" },
      { status: 400 }
    );
  }
}
