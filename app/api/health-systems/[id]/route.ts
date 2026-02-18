import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { healthSystemUpdateSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = healthSystemUpdateSchema.parse(body);

    const updated = await prisma.healthSystem.update({
      where: { id },
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
        researchNotes: input.researchNotes || null,
        researchUpdatedAt: new Date()
      },
      include: {
        executives: true,
        venturePartners: true,
        investments: true,
        researchJobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    return NextResponse.json({ healthSystem: updated });
  } catch (error) {
    console.error("update_health_system_error", error);
    return NextResponse.json({ error: "Failed to update health system" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await prisma.healthSystem.delete({
      where: { id }
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("delete_health_system_error", error);
    return NextResponse.json({ error: "Failed to delete health system" }, { status: 400 });
  }
}
