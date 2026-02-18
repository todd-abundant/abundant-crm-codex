import { NextResponse } from "next/server";
import { companySearchRequestSchema } from "@/lib/schemas";
import { searchCompanyCandidates } from "@/lib/company-research";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = companySearchRequestSchema.parse(body);
    const result = await searchCompanyCandidates(query);

    return NextResponse.json(result);
  } catch (error) {
    console.error("search_company_error", error);
    return NextResponse.json({ error: "Failed to search companies" }, { status: 400 });
  }
}
