"use client";

import * as React from "react";

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

export function CoInvestorSignalsDigestRunner() {
  const [isRunning, setIsRunning] = React.useState(false);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function runSweep() {
    setIsRunning(true);
    setStatus(null);

    try {
      const response = await fetch("/api/co-investors/signals/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      const payload = (await response.json().catch(() => ({}))) as SweepResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Signal sweep failed");
      }

      const result = payload.result;
      if (!result) {
        throw new Error("Signal sweep response missing result");
      }

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
          `Processed ${result.processed} co-investors. ` +
          `Discovered ${result.discovered}, persisted ${result.persisted}, failed ${result.failed}.`
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

  return (
    <div>
      <button type="button" className="secondary" disabled={isRunning} onClick={() => void runSweep()}>
        {isRunning ? "Running Signal Sweep..." : "Run Signal Sweep Now"}
      </button>
      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}
    </div>
  );
}
