import { NextResponse } from "next/server";
import { verifyCandidateRequestSchema } from "@/lib/schemas";
import { runQueuedResearchJobs, verifyCandidateAndQueueResearch } from "@/lib/research-jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { candidate, isAllianceMember, isLimitedPartner, limitedPartnerInvestmentUsd } =
      verifyCandidateRequestSchema.parse(body);

    const created = await verifyCandidateAndQueueResearch({
      candidate,
      isAllianceMember,
      isLimitedPartner,
      limitedPartnerInvestmentUsd
    });

    // Fire-and-forget so enrichment can run after the user confirms a candidate.
    void runQueuedResearchJobs(1, { healthSystemId: created.healthSystem.id }).catch((error) => {
      console.error("auto_run_research_job_error", error);
    });

    return NextResponse.json({
      healthSystem: created.healthSystem,
      job: created.job,
      queued: true
    });
  } catch (error) {
    console.error("verify_health_system_error", error);
    const message = error instanceof Error ? error.message : "Failed to verify and queue research";
    if (message.startsWith("Duplicate health system:")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
