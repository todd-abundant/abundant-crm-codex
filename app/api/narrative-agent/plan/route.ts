import { NextResponse } from "next/server";
import { buildNarrativePlan } from "@/lib/narrative-agent";
import { narrativePlanRequestSchema } from "@/lib/narrative-agent-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { narrative } = narrativePlanRequestSchema.parse(body);

    const plan = await buildNarrativePlan(narrative);

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("narrative_agent_plan_error", error);
    const message = error instanceof Error ? error.message : "Failed to build narrative plan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
