import { PipelineKanban } from "@/components/pipeline-kanban";
import { normalizePipelineCompanyType } from "@/lib/pipeline-opportunities";

export default async function PipelinePage({
  searchParams
}: {
  searchParams: Promise<{ companyType?: string }>;
}) {
  const params = await searchParams;
  const companyType = normalizePipelineCompanyType(params.companyType);

  return <PipelineKanban companyType={companyType} />;
}
