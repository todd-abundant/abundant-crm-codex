import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const feedbackSentimentSchema = z.enum(["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE"]);

const insightSchema = z.object({
  speakerName: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().min(1).max(2_000),
  sentiment: feedbackSentimentSchema,
  theme: z.string().trim().min(1).max(160),
  healthSystemId: z.string().trim().min(1),
  contactId: z.string().trim().min(1).optional().nullable()
});

const requestSchema = z.object({
  companyId: z.string().trim().min(1),
  category: z.string().trim().min(1).max(120).optional(),
  insights: z.array(insightSchema).min(1).max(200)
});

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(dr|mr|mrs|ms|md)\.?\s+/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimToNull(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const category = (input.category || "Transcript Insight").trim();

    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true }
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const healthSystemIds = Array.from(new Set(input.insights.map((entry) => entry.healthSystemId)));
    const healthSystems = await prisma.healthSystem.findMany({
      where: {
        id: { in: healthSystemIds },
        isAllianceMember: true
      },
      select: { id: true, name: true }
    });
    const healthSystemMap = new Map(healthSystems.map((entry) => [entry.id, entry]));

    const missingHealthSystemId = healthSystemIds.find((id) => !healthSystemMap.has(id));
    if (missingHealthSystemId) {
      return NextResponse.json(
        { error: "All selected insights must map to alliance-member health systems before saving." },
        { status: 400 }
      );
    }

    const contacts = await prisma.contact.findMany({
      where: {
        healthSystemLinks: {
          some: {
            healthSystemId: { in: healthSystemIds }
          }
        }
      },
      select: {
        id: true,
        name: true,
        title: true,
        healthSystemLinks: {
          where: {
            healthSystemId: { in: healthSystemIds }
          },
          select: {
            healthSystemId: true
          }
        }
      }
    });

    const contactsById = new Map<
      string,
      {
        id: string;
        name: string;
        title: string | null;
        healthSystemIds: Set<string>;
      }
    >();
    const contactsByHealthSystemAndName = new Map<
      string,
      Array<{
        id: string;
        name: string;
        title: string | null;
      }>
    >();

    for (const contact of contacts) {
      const linkedHealthSystemIds = new Set(contact.healthSystemLinks.map((entry) => entry.healthSystemId));
      contactsById.set(contact.id, {
        id: contact.id,
        name: contact.name,
        title: contact.title,
        healthSystemIds: linkedHealthSystemIds
      });

      const normalizedName = normalizeKey(contact.name);
      if (!normalizedName) continue;

      for (const link of contact.healthSystemLinks) {
        const key = `${link.healthSystemId}::${normalizedName}`;
        const existing = contactsByHealthSystemAndName.get(key) || [];
        if (!existing.some((entry) => entry.id === contact.id)) {
          existing.push({
            id: contact.id,
            name: contact.name,
            title: contact.title
          });
          contactsByHealthSystemAndName.set(key, existing);
        }
      }
    }

    let linkedByProvidedContactCount = 0;
    let linkedByNameMatchCount = 0;
    let unlinkedCount = 0;

    const createRows = input.insights.map((entry) => {
      const normalizedSpeaker = normalizeKey(entry.speakerName);
      const normalizedExcerpt = entry.excerpt.trim();

      let contactId: string | null = null;
      let attributionName = entry.speakerName.trim();
      const providedContactId = trimToNull(entry.contactId);

      if (providedContactId) {
        const providedContact = contactsById.get(providedContactId);
        if (providedContact && providedContact.healthSystemIds.has(entry.healthSystemId)) {
          contactId = providedContact.id;
          attributionName = providedContact.name;
          linkedByProvidedContactCount += 1;
        }
      }

      if (!contactId && normalizedSpeaker) {
        const lookupKey = `${entry.healthSystemId}::${normalizedSpeaker}`;
        const candidates = contactsByHealthSystemAndName.get(lookupKey) || [];
        if (candidates.length === 1) {
          contactId = candidates[0].id;
          attributionName = candidates[0].name;
          linkedByNameMatchCount += 1;
        }
      }

      if (!contactId) {
        unlinkedCount += 1;
      }

      const feedbackText = `Member comment (${attributionName}): ${normalizedExcerpt}`;

      return {
        companyId: input.companyId,
        healthSystemId: entry.healthSystemId,
        contactId,
        category,
        theme: entry.theme.trim(),
        sentiment: entry.sentiment,
        feedback: feedbackText
      };
    });

    const created = await prisma.companyScreeningQualitativeFeedback.createMany({
      data: createRows
    });

    return NextResponse.json({
      company,
      category,
      createdCount: created.count,
      attribution: {
        linkedByProvidedContactCount,
        linkedByNameMatchCount,
        unlinkedCount
      }
    });
  } catch (error) {
    console.error("save_transcript_member_insights_error", error);
    return NextResponse.json({ error: "Failed to save selected transcript insights." }, { status: 400 });
  }
}
