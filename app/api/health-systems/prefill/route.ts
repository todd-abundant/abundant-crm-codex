import { NextResponse } from "next/server";
import { prefillRequestSchema } from "@/lib/schemas";
import { prefillHealthSystemFromNaturalLanguage } from "@/lib/research";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = prefillRequestSchema.parse(body);

    const { draft, researchUsed } = await prefillHealthSystemFromNaturalLanguage(prompt);

    return NextResponse.json({ draft, researchUsed });
  } catch (error) {
    console.error("prefill_error", error);
    return NextResponse.json({ error: "Failed to prefill health system" }, { status: 400 });
  }
}
