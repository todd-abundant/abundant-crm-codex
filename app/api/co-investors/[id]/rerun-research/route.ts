import { NextResponse } from "next/server";
import { queueResearchForCoInvestor, runQueuedResearchJobs } from "@/lib/co-investor-jobs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const queued = await queueResearchForCoInvestor(id);

    void runQueuedResearchJobs(1, { coInvestorId: id }).catch((error) => {
      console.error("rerun_co_investor_research_auto_process_error", error);
    });

    return NextResponse.json({
      coInvestor: queued.coInvestor,
      job: queued.job,
      queued: true
    });
  } catch (error) {
    console.error("rerun_co_investor_research_error", error);
    return NextResponse.json({ error: "Failed to queue co-investor research rerun" }, { status: 400 });
  }
}
