import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshSurveyDrivenScreeningOpportunity } from "@/lib/screening-opportunity-sync";

const postSchema = z.object({
  healthSystemId: z.string().min(1).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const input = postSchema.parse(await request.json().catch(() => ({})));

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true }
    });
    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const healthSystemIds = input.healthSystemId
      ? [input.healthSystemId]
      : Array.from(
          new Set(
            (
              await prisma.companyScreeningSurveySubmission.findMany({
                where: {
                  session: { companyId },
                  healthSystemId: { not: null }
                },
                select: { healthSystemId: true }
              })
            )
              .map((entry) => entry.healthSystemId)
              .filter((healthSystemId): healthSystemId is string => Boolean(healthSystemId))
          )
        );

    const results = await prisma.$transaction(async (tx) => {
      const refreshed = [];
      for (const healthSystemId of healthSystemIds) {
        refreshed.push(
          await refreshSurveyDrivenScreeningOpportunity(tx, {
            companyId,
            healthSystemId,
            force: true
          })
        );
      }
      return refreshed;
    });

    return NextResponse.json({
      refreshedCount: results.length,
      results
    });
  } catch (error) {
    console.error("refresh_pipeline_screening_opportunities_error", error);
    return NextResponse.json({ error: "Failed to refresh screening opportunities" }, { status: 400 });
  }
}
