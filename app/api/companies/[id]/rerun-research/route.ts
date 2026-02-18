import { NextResponse } from "next/server";
import { queueResearchForCompany, runQueuedResearchJobs } from "@/lib/company-jobs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const queued = await queueResearchForCompany(id);

    void runQueuedResearchJobs(1, { companyId: id }).catch((error) => {
      console.error("rerun_company_research_auto_process_error", error);
    });

    return NextResponse.json({
      company: queued.company,
      job: queued.job,
      queued: true
    });
  } catch (error) {
    console.error("rerun_company_research_error", error);
    return NextResponse.json({ error: "Failed to queue company research rerun" }, { status: 400 });
  }
}
