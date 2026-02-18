import { NextResponse } from "next/server";
import { processResearchJobsRequestSchema } from "@/lib/schemas";
import { runQueuedResearchJobs } from "@/lib/co-investor-jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { maxJobs } = processResearchJobsRequestSchema.parse(body);

    const result = await runQueuedResearchJobs(maxJobs);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("process_co_investor_jobs_error", error);
    return NextResponse.json({ error: "Failed to process co-investor research jobs" }, { status: 400 });
  }
}
