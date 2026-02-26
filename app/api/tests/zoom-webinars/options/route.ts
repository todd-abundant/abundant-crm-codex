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
        where: { isAllianceMember: true },
        select: { id: true, name: true, website: true },
        orderBy: [{ name: "asc" }]
      })
    ]);

    return NextResponse.json({ companies, healthSystems });
  } catch (error) {
    console.error("get_zoom_test_options_error", error);
    return NextResponse.json({ error: "Failed to load options" }, { status: 400 });
  }
}
