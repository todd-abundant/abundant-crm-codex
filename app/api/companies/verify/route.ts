import { NextResponse } from "next/server";
import { companyVerifyRequestSchema } from "@/lib/schemas";
import { verifyCandidateAndQueueResearch } from "@/lib/company-jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = companyVerifyRequestSchema.parse(body);

    const created = await verifyCandidateAndQueueResearch({
      candidate: payload.candidate,
      companyType: payload.companyType,
      primaryCategory: payload.primaryCategory,
      primaryCategoryOther: payload.primaryCategoryOther,
      leadSourceType: payload.leadSourceType,
      leadSourceHealthSystemId: payload.leadSourceHealthSystemId || null,
      leadSourceOther: payload.leadSourceOther
    });

    return NextResponse.json({
      company: created.company,
      job: created.job,
      queued: true
    });
  } catch (error) {
    console.error("verify_company_error", error);
    const message = error instanceof Error ? error.message : "Failed to verify and queue company research";
    if (message.startsWith("Duplicate company:")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
