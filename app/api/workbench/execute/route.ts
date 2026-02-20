import { NextResponse } from "next/server";
import { executeWorkbenchPlan } from "@/lib/workbench-v2";
import { workbenchExecuteRequestSchema } from "@/lib/workbench-v2-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plan } = workbenchExecuteRequestSchema.parse(body);
    const report = await executeWorkbenchPlan(plan);
    return NextResponse.json(report);
  } catch (error) {
    console.error("workbench_execute_error", error);
    const message = error instanceof Error ? error.message : "Failed to execute Workbench plan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
