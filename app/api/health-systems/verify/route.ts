import { NextResponse } from "next/server";
import { resolveAllianceMemberStatus, verifyCandidateRequestSchema } from "@/lib/schemas";
import { verifyCandidateAndQueueResearch } from "@/lib/research-jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { candidate, isAllianceMember, allianceMemberStatus } = verifyCandidateRequestSchema.parse(body);
    const resolvedAllianceMemberStatus = resolveAllianceMemberStatus({
      isAllianceMember,
      allianceMemberStatus
    });

    const created = await verifyCandidateAndQueueResearch({
      candidate,
      isAllianceMember: resolvedAllianceMemberStatus === "YES",
      allianceMemberStatus: resolvedAllianceMemberStatus,
      isLimitedPartner: false,
      limitedPartnerInvestmentUsd: null
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
