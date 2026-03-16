import { NextResponse } from "next/server";
import { runHealthSystemSignalsSweep } from "@/lib/health-system-signals";
import { stakeholderSignalsProcessRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = stakeholderSignalsProcessRequestSchema.parse(body);

    const result = await runHealthSystemSignalsSweep({
      maxHealthSystems: input.maxEntities,
      maxSignalsPerEntity: input.maxSignalsPerEntity,
      lookbackDays: input.lookbackDays
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("process_health_system_signals_error", error);
    return NextResponse.json({ error: "Failed to process health system signals" }, { status: 400 });
  }
}
