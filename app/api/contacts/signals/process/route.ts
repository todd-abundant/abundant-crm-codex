import { NextResponse } from "next/server";
import { runContactSignalsSweep } from "@/lib/contact-signals";
import { stakeholderSignalsProcessRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = stakeholderSignalsProcessRequestSchema.parse(body);

    const result = await runContactSignalsSweep({
      maxContacts: input.maxEntities,
      maxSignalsPerEntity: input.maxSignalsPerEntity,
      lookbackDays: input.lookbackDays
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("process_contact_signals_error", error);
    return NextResponse.json({ error: "Failed to process contact signals" }, { status: 400 });
  }
}
