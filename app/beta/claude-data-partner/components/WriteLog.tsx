"use client";

import * as React from "react";
import type { WriteLog } from "@/lib/claude-data-partner/types";

type WriteLogProps = {
  log: WriteLog;
};

export function WriteLogView({ log }: WriteLogProps) {
  const [copied, setCopied] = React.useState(false);

  const successCount = log.results.filter((r) => r.success).length;
  const failCount = log.results.filter((r) => !r.success).length;

  function copyLog() {
    const lines = log.results.map((r) =>
      r.success
        ? `✅ ${r.changeId}: written (id: ${r.recordId || "?"})`
        : `❌ ${r.changeId}: FAILED — ${r.error || "unknown error"}`
    );
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>
          {successCount} applied{failCount > 0 ? `, ${failCount} failed` : ""}
        </span>
        <button
          type="button"
          className="btn"
          style={{ fontSize: "12px", marginLeft: "auto" }}
          onClick={copyLog}
        >
          {copied ? "Copied!" : "Copy log"}
        </button>
      </div>

      <div
        style={{
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <tbody>
            {log.results.map((result, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: i < log.results.length - 1 ? "1px solid #f3f4f6" : "none",
                  background: result.success ? "#f0fdf4" : "#fef2f2",
                }}
              >
                <td style={{ padding: "8px 12px", width: "20px" }}>
                  {result.success ? "✅" : "❌"}
                </td>
                <td style={{ padding: "8px 4px", color: "#374151", fontFamily: "monospace" }}>
                  {result.changeId.slice(0, 8)}…
                </td>
                <td style={{ padding: "8px 12px", color: result.success ? "#065f46" : "#991b1b" }}>
                  {result.success
                    ? `Written${result.recordId ? ` — id: ${result.recordId.slice(0, 12)}…` : ""}`
                    : `Failed: ${result.error || "unknown error"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "11px", color: "#6b7280", margin: 0 }}>
        Applied at {new Date(log.appliedAt).toLocaleString()}
      </p>
    </div>
  );
}
