import { NextResponse } from "next/server";
import { buildWorkbenchDraft } from "@/lib/workbench-v2";
import { workbenchIntakeRequestSchema } from "@/lib/workbench-v2-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { conversation } = workbenchIntakeRequestSchema.parse(body);
    const draft = await buildWorkbenchDraft(conversation);
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("workbench_intake_error", error);
    const message = error instanceof Error ? error.message : "Failed to build Workbench draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
