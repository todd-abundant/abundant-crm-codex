import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import {
  CompanyReportError,
  createCompanyReportDraft,
  listCompanyReports,
  parseReportType
} from "@/lib/company-reports";

const createReportSchema = z.object({
  type: z.enum(["INTAKE", "SCREENING", "OPPORTUNITY"]),
  title: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  audienceLabel: z.string().optional().nullable(),
  confidentialityLabel: z.string().optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable()
});

function parseTypeQuery(value: string | null) {
  if (!value) return null;
  return parseReportType(value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const type = parseTypeQuery(new URL(request.url).searchParams.get("type"));
    const reports = await listCompanyReports({ companyId, type });
    return NextResponse.json({ reports });
  } catch (error) {
    if (error instanceof CompanyReportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("list_pipeline_company_reports_error", error);
    return NextResponse.json({ error: "Failed to load company reports." }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const input = createReportSchema.parse(body);
    const report = await createCompanyReportDraft({
      companyId,
      type: input.type,
      userId: user.id,
      title: input.title,
      subtitle: input.subtitle,
      audienceLabel: input.audienceLabel,
      confidentialityLabel: input.confidentialityLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    if (error instanceof CompanyReportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("create_pipeline_company_report_error", error);
    return NextResponse.json({ error: "Failed to create company report draft." }, { status: 400 });
  }
}
