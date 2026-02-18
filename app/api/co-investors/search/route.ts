import { NextResponse } from "next/server";
import { coInvestorSearchRequestSchema } from "@/lib/schemas";
import { searchCoInvestorCandidates } from "@/lib/co-investor-research";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = coInvestorSearchRequestSchema.parse(body);
    const result = await searchCoInvestorCandidates(query);

    return NextResponse.json(result);
  } catch (error) {
    console.error("search_co_investor_error", error);
    return NextResponse.json({ error: "Failed to search co-investors" }, { status: 400 });
  }
}
