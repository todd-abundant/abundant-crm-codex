import { NextResponse } from "next/server";
import { runCompanySignalsSweep } from "@/lib/company-signals";
import { stakeholderSignalsProcessRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = stakeholderSignalsProcessRequestSchema.parse(body);

    const result = await runCompanySignalsSweep({
      maxCompanies: input.maxEntities,
      maxSignalsPerEntity: input.maxSignalsPerEntity,
      lookbackDays: input.lookbackDays
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("process_company_signals_error", error);
    return NextResponse.json({ error: "Failed to process company signals" }, { status: 400 });
  }
}
