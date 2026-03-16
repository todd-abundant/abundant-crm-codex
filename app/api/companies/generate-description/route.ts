import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateCompanyDescription } from "@/lib/company-research";

const requestSchema = z.object({
  companyId: z.string().trim().optional(),
  name: z.string().trim().optional(),
  website: z.string().trim().optional(),
  googleTranscriptUrl: z.string().trim().optional(),
  providedContext: z.string().trim().optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    let persistedCompany: {
      name: string;
      website: string | null;
      googleTranscriptUrl: string | null;
      description: string | null;
      researchNotes: string | null;
      documents: Array<{
        type: string;
        title: string;
        url: string;
        notes: string | null;
      }>;
    } | null = null;

    if (input.companyId) {
      persistedCompany = await prisma.company.findUnique({
        where: { id: input.companyId },
        select: {
          name: true,
          website: true,
          googleTranscriptUrl: true,
          description: true,
          researchNotes: true,
          documents: {
            select: {
              type: true,
              title: true,
              url: true,
              notes: true
            },
            orderBy: [{ createdAt: "desc" }],
            take: 6
          }
        }
      });

      if (!persistedCompany) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }
    }

    const name = input.name || persistedCompany?.name || "";
    if (!name) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }

    const description = await generateCompanyDescription({
      name,
      website: input.website || persistedCompany?.website || null,
      googleTranscriptUrl: input.googleTranscriptUrl || persistedCompany?.googleTranscriptUrl || null,
      providedContext:
        input.providedContext || persistedCompany?.researchNotes || persistedCompany?.description || null,
      documents: persistedCompany?.documents || []
    });

    return NextResponse.json({ description });
  } catch (error) {
    console.error("generate_company_description_error", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate company description"
      },
      { status: 400 }
    );
  }
}
