"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DIGEST_KINDS, type DigestKind, stakeholderSignalsConfig } from "@/lib/stakeholder-signals-config";

type SweepResponse = {
  result?: {
    ok: boolean;
    reason?: string;
    processed: number;
    discovered: number;
    persisted: number;
    failed: number;
  };
  error?: string;
};

type Props = {
  kind: DigestKind;
};

async function runSweepForKind(kind: DigestKind) {
  const response = await fetch(stakeholderSignalsConfig[kind].processRoute, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const payload = (await response.json().catch(() => ({}))) as SweepResponse;
  if (!response.ok) {
    throw new Error(payload.error || `${stakeholderSignalsConfig[kind].label} sweep failed`);
  }
  if (!payload.result) {
    throw new Error(`${stakeholderSignalsConfig[kind].label} sweep response missing result`);
  }

  return payload.result;
}

export function CoInvestorSignalsDigestRunner({ kind }: Props) {
  const router = useRouter();
  const [isRunning, setIsRunning] = React.useState(false);
  const [isRefreshing, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function runSelectedSweep() {
    setIsRunning(true);
    setStatus(null);

    try {
      const result = await runSweepForKind(kind);
      if (!result.ok) {
        setStatus({
          kind: "error",
          text: result.reason || "Sweep completed with configuration issues."
        });
        return;
      }

      setStatus({
        kind: "ok",
        text:
          `Processed ${result.processed} ${stakeholderSignalsConfig[kind].label.toLowerCase()}. ` +
          `Discovered ${result.discovered}, persisted ${result.persisted}, failed ${result.failed}.`
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Signal sweep failed"
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function runAllSweeps() {
    setIsRunning(true);
    setStatus(null);

    try {
      const summaries: string[] = [];
      for (const nextKind of DIGEST_KINDS) {
        const result = await runSweepForKind(nextKind);
        if (!result.ok) {
          throw new Error(result.reason || `${stakeholderSignalsConfig[nextKind].label} sweep has configuration issues.`);
        }
        summaries.push(
          `${stakeholderSignalsConfig[nextKind].label}: ${result.persisted} saved from ${result.discovered} discovered`
        );
      }

      setStatus({
        kind: "ok",
        text: summaries.join(" | ")
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Signal sweep failed"
      });
    } finally {
      setIsRunning(false);
    }
  }

  const isBusy = isRunning || isRefreshing;

  return (
    <>
      <div className="detail-action-bar" style={{ marginLeft: "auto", alignItems: "center" }}>
        <button
          type="button"
          className="detail-tab screening-material-preview-action"
          style={{ marginLeft: 0 }}
          disabled={isBusy}
          onClick={() => void runSelectedSweep()}
        >
          {isBusy ? "Running..." : `Run ${stakeholderSignalsConfig[kind].singularLabel} Sweep`}
        </button>
        <button
          type="button"
          className="detail-tab screening-material-preview-action"
          style={{ marginLeft: 0 }}
          disabled={isBusy}
          onClick={() => void runAllSweeps()}
        >
          {isBusy ? "Running..." : "Run All Digests"}
        </button>
      </div>
      {isRefreshing ? <p className="status ok">Refreshing digest...</p> : null}
      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}
    </>
  );
}
