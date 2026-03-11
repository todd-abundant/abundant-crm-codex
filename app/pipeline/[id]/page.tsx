import { PipelineOpportunityPageClient } from "@/components/pipeline-opportunity-detail-page";

type SearchParams = {
  returnTo?: string | string[];
  opportunityId?: string | string[];
};

function coerceReturnTo(searchParams: SearchParams): string | null {
  const rawValue = Array.isArray(searchParams.returnTo) ? searchParams.returnTo[0] : searchParams.returnTo;
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

function coerceOpportunityId(searchParams: SearchParams): string | null {
  const rawValue = Array.isArray(searchParams.opportunityId) ? searchParams.opportunityId[0] : searchParams.opportunityId;
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  return trimmed;
}

export default async function PipelineOpportunityPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const returnTo = coerceReturnTo(resolvedSearchParams || {});
  const initialOpportunityId = coerceOpportunityId(resolvedSearchParams || {});
  return <PipelineOpportunityPageClient itemId={id} returnTo={returnTo} initialOpportunityId={initialOpportunityId} />;
}
