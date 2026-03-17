import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { healthSystemUpdateSchema, resolveAllianceMemberStatus } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = healthSystemUpdateSchema.parse(body);
    const allianceMemberStatus = resolveAllianceMemberStatus(input);
    const data: Prisma.HealthSystemUpdateInput = {
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
      isAllianceMember: allianceMemberStatus === "YES",
      allianceMemberStatus,
      researchUpdatedAt: new Date()
    };

    if (input.researchNotes !== undefined) {
      data.researchNotes = input.researchNotes || null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const healthSystem = await tx.healthSystem.update({
        where: { id },
        data,
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
          companyHealthSystemLinks: {
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
        }
      });

      const pipeline = await tx.healthSystemAlliancePipeline.findUnique({
        where: { healthSystemId: id },
        select: {
          status: true
        }
      });

      if (pipeline && pipeline.status !== "CLOSED") {
        if (allianceMemberStatus === "REVISIT_LATER" && pipeline.status !== "REVISIT") {
          await tx.healthSystemAlliancePipeline.update({
            where: { healthSystemId: id },
            data: {
              status: "REVISIT"
            }
          });
        } else if (allianceMemberStatus !== "REVISIT_LATER" && pipeline.status === "REVISIT") {
          await tx.healthSystemAlliancePipeline.update({
            where: { healthSystemId: id },
            data: {
              status: "ACTIVE"
            }
          });
        }
      }

      return healthSystem;
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
