import { NextResponse } from "next/server";
import { executeNarrativePlan } from "@/lib/narrative-agent";
import { narrativeExecuteRequestSchema } from "@/lib/narrative-agent-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plan } = narrativeExecuteRequestSchema.parse(body);

    const report = await executeNarrativePlan(plan);

    return NextResponse.json(report);
  } catch (error) {
    console.error("narrative_agent_execute_error", error);
    const message = error instanceof Error ? error.message : "Failed to execute narrative plan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
