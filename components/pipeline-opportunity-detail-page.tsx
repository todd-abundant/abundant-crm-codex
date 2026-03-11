"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PipelineOpportunityDetailView } from "@/components/pipeline-opportunity-detail";

type PipelineOpportunityPageClientProps = {
  itemId: string;
  returnTo: string | null;
  initialOpportunityId: string | null;
};

export function PipelineOpportunityPageClient({
  itemId,
  returnTo,
  initialOpportunityId
}: PipelineOpportunityPageClientProps) {
  const router = useRouter();
  const handleClose = React.useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/pipeline");
  }, [returnTo, router]);

  return (
    <PipelineOpportunityDetailView
      itemId={itemId}
      initialOpportunityId={initialOpportunityId}
      onCloseModal={handleClose}
    />
  );
}
