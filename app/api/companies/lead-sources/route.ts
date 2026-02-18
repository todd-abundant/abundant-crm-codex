import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const records = await prisma.company.findMany({
    where: {
      leadSourceType: "OTHER",
      AND: [
        { leadSourceOther: { not: null } },
        { leadSourceOther: { not: "" } }
      ]
    },
    select: { leadSourceOther: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  const seen = new Set<string>();
  const leadSources: string[] = [];

  for (const record of records) {
    const trimmed = record.leadSourceOther?.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    leadSources.push(trimmed);
    if (leadSources.length >= 50) break;
  }

  return NextResponse.json({ leadSources });
}
