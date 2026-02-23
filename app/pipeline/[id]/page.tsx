import { PipelineOpportunityDetailView } from "@/components/pipeline-opportunity-detail";

export default async function PipelineOpportunityPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PipelineOpportunityDetailView itemId={id} />;
}
