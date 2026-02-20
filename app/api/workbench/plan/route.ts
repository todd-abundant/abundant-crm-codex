import { NextResponse } from "next/server";
import { buildWorkbenchPlan } from "@/lib/workbench-v2";
import { workbenchPlanRequestSchema } from "@/lib/workbench-v2-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = workbenchPlanRequestSchema.parse(body);
    const response = await buildWorkbenchPlan(payload);
    return NextResponse.json(response);
  } catch (error) {
    console.error("workbench_plan_error", error);
    const message = error instanceof Error ? error.message : "Failed to finalize Workbench plan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
