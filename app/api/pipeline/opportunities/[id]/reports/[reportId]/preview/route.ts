import { NextResponse } from "next/server";
import { CompanyReportError, previewCompanyReport } from "@/lib/company-reports";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id: companyId, reportId } = await context.params;
    const report = await previewCompanyReport({ companyId, reportId });
    return NextResponse.json({ report, html: report.renderedHtml });
  } catch (error) {
    if (error instanceof CompanyReportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("preview_pipeline_company_report_error", error);
    return NextResponse.json({ error: "Failed to preview report." }, { status: 400 });
  }
}
