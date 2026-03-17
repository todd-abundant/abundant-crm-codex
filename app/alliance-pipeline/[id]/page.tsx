import { AlliancePipelineDetailView } from "@/components/alliance-pipeline-detail";

export default async function AlliancePipelineDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  return <AlliancePipelineDetailView healthSystemId={id} returnTo={resolvedSearchParams.returnTo || null} />;
}
