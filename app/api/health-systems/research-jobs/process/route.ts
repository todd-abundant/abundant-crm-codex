import { NextResponse } from "next/server";
import { processResearchJobsRequestSchema } from "@/lib/schemas";
import { runQueuedResearchJobs } from "@/lib/research-jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { maxJobs } = processResearchJobsRequestSchema.parse(body);

    const result = await runQueuedResearchJobs(maxJobs);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("process_research_jobs_error", error);
    return NextResponse.json({ error: "Failed to process research jobs" }, { status: 400 });
  }
}
