import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const requestSchema = z.object({
  entityType: z.enum(["HEALTH_SYSTEM", "COMPANY", "CO_INVESTOR", "CONTACT"]),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(25).optional(),
  healthSystemId: z.string().min(1).optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entityType, query, limit = 12, healthSystemId } = requestSchema.parse(body);
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return NextResponse.json({ results: [] });
    }

    if (entityType === "HEALTH_SYSTEM") {
      const results = await prisma.healthSystem.findMany({
        where: {
          OR: [
            { name: { contains: normalizedQuery, mode: "insensitive" } },
            { legalName: { contains: normalizedQuery, mode: "insensitive" } },
            { website: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        },
        select: {
          id: true,
          name: true,
          headquartersCity: true,
          headquartersState: true
        },
        orderBy: { name: "asc" },
        take: limit
      });

      return NextResponse.json({
        results: results.map((item) => ({
          id: item.id,
          name: item.name,
          subtitle: [item.headquartersCity, item.headquartersState].filter(Boolean).join(", ") || null
        }))
      });
    }

    if (entityType === "COMPANY") {
      const results = await prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: normalizedQuery, mode: "insensitive" } },
            { legalName: { contains: normalizedQuery, mode: "insensitive" } },
            { website: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        },
        select: {
          id: true,
          name: true,
          headquartersCity: true,
          headquartersState: true
        },
        orderBy: { name: "asc" },
        take: limit
      });

      return NextResponse.json({
        results: results.map((item) => ({
          id: item.id,
          name: item.name,
          subtitle: [item.headquartersCity, item.headquartersState].filter(Boolean).join(", ") || null
        }))
      });
    }

    if (entityType === "CO_INVESTOR") {
      const results = await prisma.coInvestor.findMany({
        where: {
          OR: [
            { name: { contains: normalizedQuery, mode: "insensitive" } },
            { legalName: { contains: normalizedQuery, mode: "insensitive" } },
            { website: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        },
        select: {
          id: true,
          name: true,
          headquartersCity: true,
          headquartersState: true
        },
        orderBy: { name: "asc" },
        take: limit
      });

      return NextResponse.json({
        results: results.map((item) => ({
          id: item.id,
          name: item.name,
          subtitle: [item.headquartersCity, item.headquartersState].filter(Boolean).join(", ") || null
        }))
      });
    }

    const results = await prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: normalizedQuery, mode: "insensitive" } },
          { title: { contains: normalizedQuery, mode: "insensitive" } },
          { email: { contains: normalizedQuery, mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        healthSystemLinks: healthSystemId
          ? {
              where: { healthSystemId },
              select: { id: true }
            }
          : false
      },
      orderBy: { name: "asc" },
      take: Math.min(limit * 4, 80)
    });

    const queryLower = normalizedQuery.toLowerCase();
    const ranked = results
      .map((item) => {
        const nameLower = (item.name || "").toLowerCase();
        const titleLower = (item.title || "").toLowerCase();
        const emailLower = (item.email || "").toLowerCase();
        const isAffiliated =
          healthSystemId && Array.isArray(item.healthSystemLinks)
            ? item.healthSystemLinks.length > 0
            : false;

        let score = 0;
        if (isAffiliated) score += 100;
        if (nameLower === queryLower) score += 50;
        if (nameLower.startsWith(queryLower)) score += 30;
        if (titleLower.startsWith(queryLower)) score += 15;
        if (emailLower.startsWith(queryLower)) score += 10;

        return { item, isAffiliated, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.name.localeCompare(b.item.name);
      })
      .slice(0, limit);

    return NextResponse.json({
      results: ranked.map(({ item, isAffiliated }) => ({
        id: item.id,
        name: item.name,
        subtitle: [item.title || item.email || null, isAffiliated ? "Affiliated contact" : null]
          .filter(Boolean)
          .join(" · ")
      }))
    });
  } catch (error) {
    console.error("entity_search_error", error);
    const message = error instanceof Error ? error.message : "Failed to search records";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
