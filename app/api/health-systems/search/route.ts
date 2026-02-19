import { NextResponse } from "next/server";
import { healthSystemSearchRequestSchema } from "@/lib/schemas";
import { searchHealthSystemCandidates } from "@/lib/research";

export async function POST(request: Request) {
  let query = "";
  try {
    const body = await request.json();
    const parsed = healthSystemSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 });
    }

    query = parsed.data.query;
    const result = await searchHealthSystemCandidates(query);

    return NextResponse.json(result);
  } catch (error) {
    console.error("search_health_system_error", error);
    return NextResponse.json({
      candidates: [
        {
          name: query.trim(),
          headquartersCity: "",
          headquartersState: "",
          headquartersCountry: "",
          website: "",
          summary: "AI web search is temporarily unavailable. Confirm and enqueue research, then retry later.",
          sourceUrls: []
        }
      ],
      researchUsed: false
    });
  }
}
