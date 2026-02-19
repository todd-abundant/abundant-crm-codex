import { NextResponse } from "next/server";
import { coInvestorSearchRequestSchema } from "@/lib/schemas";
import { searchCoInvestorCandidates } from "@/lib/co-investor-research";

export async function POST(request: Request) {
  let query = "";
  try {
    const body = await request.json();
    const parsed = coInvestorSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 });
    }

    query = parsed.data.query;
    const result = await searchCoInvestorCandidates(query);

    return NextResponse.json(result);
  } catch (error) {
    console.error("search_co_investor_error", error);
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
