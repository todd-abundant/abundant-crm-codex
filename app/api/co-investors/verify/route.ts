import { NextResponse } from "next/server";
import { coInvestorVerifyRequestSchema } from "@/lib/schemas";
import { verifyCandidateAndQueueResearch } from "@/lib/co-investor-jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { candidate, isSeedInvestor, isSeriesAInvestor } = coInvestorVerifyRequestSchema.parse(body);

    const created = await verifyCandidateAndQueueResearch({
      candidate,
      isSeedInvestor,
      isSeriesAInvestor
    });

    return NextResponse.json({
      coInvestor: created.coInvestor,
      job: created.job,
      queued: true
    });
  } catch (error) {
    console.error("verify_co_investor_error", error);
    const message = error instanceof Error ? error.message : "Failed to verify and queue research";
    if (message.startsWith("Duplicate co-investor:")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
