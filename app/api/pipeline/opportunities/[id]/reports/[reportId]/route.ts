import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import {
  CompanyReportError,
  getCompanyReportDetail,
  parseSectionStatePayload,
  updateCompanyReportDraft
} from "@/lib/company-reports";

const sectionStateSchema = z.object({
  sectionId: z.string().min(1),
  mode: z.enum(["AUTO", "OVERRIDE"]).default("AUTO"),
  isHidden: z.boolean().default(false),
  overrideTitle: z.string().optional().default(""),
  overrideBodyHtml: z.string().optional().default("")
});

const patchSchema = z.object({
  expectedUpdatedAt: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  audienceLabel: z.string().optional().nullable(),
  confidentialityLabel: z.string().optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  sectionState: z.array(sectionStateSchema).optional(),
  refreshFromLatestData: z.boolean().optional(),
  resetOverrides: z.boolean().optional()
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id: companyId, reportId } = await context.params;
    const report = await getCompanyReportDetail({ companyId, reportId });
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof CompanyReportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("get_pipeline_company_report_error", error);
    return NextResponse.json({ error: "Failed to load report detail." }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId, reportId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const input = patchSchema.parse(body);

    const report = await updateCompanyReportDraft({
      companyId,
      reportId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      title: input.title,
      subtitle: input.subtitle,
      audienceLabel: input.audienceLabel,
      confidentialityLabel: input.confidentialityLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      sectionState: parseSectionStatePayload(input.sectionState),
      refreshFromLatestData: input.refreshFromLatestData,
      resetOverrides: input.resetOverrides
    });

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    if (error instanceof CompanyReportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("update_pipeline_company_report_error", error);
    return NextResponse.json({ error: "Failed to update report draft." }, { status: 400 });
  }
}
