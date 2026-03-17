"use client";

import * as React from "react";
import type { PlannedChange, SignalSource } from "@/lib/claude-data-partner/types";

function formatSource(source: SignalSource): string {
  if (source.kind === "gmail") return `Email: "${source.subject}" — ${source.date}`;
  if (source.kind === "calendar") return `Calendar: "${source.summary}" — ${source.date}`;
  if (source.kind === "drive") return `Drive: "${source.title}"`;
  if (source.kind === "freetext") return `Command: "${source.input.slice(0, 60)}${source.input.length > 60 ? "…" : ""}"`;
  return "Unknown source";
}

function OperationBadge({ op }: { op: PlannedChange["operation"] }) {
  const colors: Record<string, { bg: string; color: string }> = {
    INSERT: { bg: "#d1fae5", color: "#065f46" },
    UPDATE: { bg: "#dbeafe", color: "#1e40af" },
    UPSERT: { bg: "#ede9fe", color: "#5b21b6" },
    SKIP: { bg: "#f3f4f6", color: "#6b7280" },
  };
  const style = colors[op] || colors.SKIP;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: style.bg,
        color: style.color,
      }}
    >
      {op}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: PlannedChange["confidence"] }) {
  const styles: Record<string, { bg: string; color: string; icon?: string }> = {
    HIGH: { bg: "#d1fae5", color: "#065f46" },
    MEDIUM: { bg: "#fef3c7", color: "#92400e" },
    LOW: { bg: "#fee2e2", color: "#991b1b", icon: "⚠" },
  };
  const s = styles[level] || styles.MEDIUM;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.icon && <span>{s.icon}</span>}
      {level}
    </span>
  );
}

type DiffCardProps = {
  change: PlannedChange;
  checked: boolean;
  onChange: (id: string, checked: boolean) => void;
  disabled?: boolean;
};

export function DiffCard({ change, checked, onChange, disabled }: DiffCardProps) {
  const isSkip = change.operation === "SKIP";
  const isLow = change.confidence === "LOW";

  return (
    <div
      style={{
        border: `1px solid ${isLow ? "#fca5a5" : "var(--color-border, #e5e7eb)"}`,
        borderRadius: "8px",
        padding: "14px 16px",
        background: isSkip ? "#f9fafb" : "#fff",
        opacity: isSkip ? 0.65 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(change.id, e.target.checked)}
          disabled={disabled || isSkip}
          style={{ marginTop: "3px", cursor: isSkip ? "not-allowed" : "pointer", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
            <OperationBadge op={change.operation} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
              {change.table}
            </span>
            <span style={{ fontSize: "13px", color: "#374151" }}>{change.label}</span>
            <ConfidenceBadge level={change.confidence} />
          </div>

          {isLow && (
            <p style={{ fontSize: "12px", color: "#b91c1c", margin: "0 0 8px 0" }}>
              Low confidence — review carefully before applying
            </p>
          )}

          {change.diffs.length > 0 && !isSkip && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "8px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#6b7280", fontWeight: 500, width: "30%" }}>
                    Field
                  </th>
                  <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#6b7280", fontWeight: 500, width: "35%" }}>
                    Was
                  </th>
                  <th style={{ textAlign: "left", padding: "2px 0 2px 0", color: "#6b7280", fontWeight: 500 }}>
                    Now
                  </th>
                </tr>
              </thead>
              <tbody>
                {change.diffs.map((diff, i) => (
                  <tr key={i}>
                    <td style={{ padding: "2px 8px 2px 0", color: "#374151", fontFamily: "monospace" }}>
                      {diff.field}
                    </td>
                    <td style={{ padding: "2px 8px 2px 0", color: "#9ca3af", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {diff.was === null ? <em>(empty)</em> : String(diff.was)}
                    </td>
                    <td style={{ padding: "2px 0 2px 0", color: "#065f46", fontWeight: 500, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {String(diff.now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ fontSize: "11px", color: "#6b7280", margin: 0 }}>
            Source: {formatSource(change.source)}
          </p>
        </div>
      </div>
    </div>
  );
}
