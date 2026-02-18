import { NextResponse } from "next/server";
import { healthSystemSearchRequestSchema } from "@/lib/schemas";
import { searchHealthSystemCandidates } from "@/lib/research";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = healthSystemSearchRequestSchema.parse(body);
    const result = await searchHealthSystemCandidates(query);

    return NextResponse.json(result);
  } catch (error) {
    console.error("search_health_system_error", error);
    return NextResponse.json({ error: "Failed to search health systems" }, { status: 400 });
  }
}
