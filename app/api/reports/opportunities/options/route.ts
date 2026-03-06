import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const [companies, healthSystems] = await Promise.all([
      prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }]
      }),
      prisma.healthSystem.findMany({
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }]
      })
    ]);

    return NextResponse.json({ companies, healthSystems });
  } catch (error) {
    console.error("list_opportunity_report_options_error", error);
    return NextResponse.json({ error: "Failed to load report filter options." }, { status: 400 });
  }
}
