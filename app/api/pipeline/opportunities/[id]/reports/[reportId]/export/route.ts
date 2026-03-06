import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { CompanyReportError, exportCompanyReport } from "@/lib/company-reports";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId, reportId } = await context.params;
    const result = await exportCompanyReport({ companyId, reportId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CompanyReportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("export_pipeline_company_report_error", error);
    return NextResponse.json({ error: "Failed to export report." }, { status: 400 });
  }
}
