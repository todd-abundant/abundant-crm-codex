import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export type EntitySearchResultItem = {
  id: string;
  entityType: "CONTACT" | "HEALTH_SYSTEM" | "CO_INVESTOR";
  name: string;
  label: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const [healthSystems, coInvestors, contacts] = await Promise.all([
      prisma.healthSystem.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true },
        take: 5,
        orderBy: { name: "asc" }
      }),
      prisma.coInvestor.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true },
        take: 5,
        orderBy: { name: "asc" }
      }),
      prisma.contact.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, title: true },
        take: 5,
        orderBy: { name: "asc" }
      })
    ]);

    const results: EntitySearchResultItem[] = [
      ...healthSystems.map((hs) => ({
        id: hs.id,
        entityType: "HEALTH_SYSTEM" as const,
        name: hs.name,
        label: `${hs.name} — Health System`
      })),
      ...coInvestors.map((ci) => ({
        id: ci.id,
        entityType: "CO_INVESTOR" as const,
        name: ci.name,
        label: `${ci.name} — Co-Investor`
      })),
      ...contacts.map((c) => ({
        id: c.id,
        entityType: "CONTACT" as const,
        name: c.name,
        label: c.title ? `${c.name} (${c.title}) — Contact` : `${c.name} — Contact`
      }))
    ].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("pipeline_entity_search_error", error);
    return NextResponse.json({ error: "Search failed" }, { status: 400 });
  }
}
