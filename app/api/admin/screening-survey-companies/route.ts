import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/server";
import {
  inferDefaultPhaseFromCompany,
  isScreeningPhase,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        pipeline: {
          select: {
            phase: true
          }
        },
        intakeStatus: true,
        declineReason: true
      },
      orderBy: [{ name: "asc" }]
    });

    return NextResponse.json({
      companies: companies.map((company) => {
        const phase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
        return {
          id: company.id,
          name: company.name,
          phase,
          phaseLabel: phaseLabel(phase),
          isScreeningStage: isScreeningPhase(phase)
        };
      })
    });
  } catch (error) {
    console.error("list_admin_screening_survey_companies_error", error);
    return NextResponse.json({ error: "Failed to load companies." }, { status: 400 });
  }
}
