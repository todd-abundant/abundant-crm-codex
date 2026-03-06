import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const [healthSystems, coInvestors, companies, opportunities] = await Promise.all([
      prisma.healthSystem.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.coInvestor.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.company.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.companyOpportunity.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          stage: true,
          estimatedCloseDate: true,
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
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 800
      })
    ]);

    return NextResponse.json({
      healthSystems,
      coInvestors,
      companies,
      opportunities
    });
  } catch (error) {
    console.error("list_contact_reference_data_error", error);
    return NextResponse.json({ error: "Failed to load contact reference data" }, { status: 500 });
  }
}
