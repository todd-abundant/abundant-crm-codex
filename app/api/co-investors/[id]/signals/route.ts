import { NextResponse } from "next/server";
import { listRecentCoInvestorSignals } from "@/lib/co-investor-signals";
import { coInvestorSignalsListQuerySchema, companyIdParamsSchema } from "@/lib/schemas";

function toOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = companyIdParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const input = coInvestorSignalsListQuerySchema.parse({
      limit: toOptionalNumber(url.searchParams.get("limit")),
      days: toOptionalNumber(url.searchParams.get("days"))
    });

    const signals = await listRecentCoInvestorSignals({
      coInvestorId: params.id,
      limit: input.limit,
      days: input.days
    });

    return NextResponse.json({ signals });
  } catch (error) {
    console.error("list_co_investor_entity_signals_error", error);
    return NextResponse.json({ error: "Failed to load co-investor signals" }, { status: 400 });
  }
}
