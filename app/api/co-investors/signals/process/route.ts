import { NextResponse } from "next/server";
import { runCoInvestorSignalsSweep } from "@/lib/co-investor-signals";
import { coInvestorSignalsProcessRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = coInvestorSignalsProcessRequestSchema.parse(body);

    const result = await runCoInvestorSignalsSweep({
      maxCoInvestors: input.maxCoInvestors,
      maxSignalsPerCoInvestor: input.maxSignalsPerCoInvestor,
      lookbackDays: input.lookbackDays
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("process_co_investor_signals_error", error);
    return NextResponse.json({ error: "Failed to process co-investor signals" }, { status: 400 });
  }
}
