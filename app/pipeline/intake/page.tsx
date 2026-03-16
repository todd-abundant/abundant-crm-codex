import { IntakeDeepDivePage } from "@/components/intake-deep-dive-page";
import { normalizePipelineCompanyType } from "@/lib/pipeline-opportunities";

type SearchParams = {
  companyType?: string;
  primaryCategory?: string;
  raiseFilter?: string;
};

export default async function IntakeDeepDiveRoute({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <IntakeDeepDivePage
      initialCompanyType={normalizePipelineCompanyType(params.companyType)}
      initialPrimaryCategory={params.primaryCategory || "ALL"}
      initialRaiseFilter={params.raiseFilter || "ALL"}
    />
  );
}
