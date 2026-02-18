import { NextResponse } from "next/server";
import { queueResearchForHealthSystem, runQueuedResearchJobs } from "@/lib/research-jobs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const queued = await queueResearchForHealthSystem(id);

    // Fire-and-forget to begin processing immediately.
    void runQueuedResearchJobs(1, { healthSystemId: id }).catch((error) => {
      console.error("rerun_research_auto_process_error", error);
    });

    return NextResponse.json({
      healthSystem: queued.healthSystem,
      job: queued.job,
      queued: true
    });
  } catch (error) {
    console.error("rerun_research_error", error);
    return NextResponse.json({ error: "Failed to queue research rerun" }, { status: 400 });
  }
}
