"use client";

import * as React from "react";
import type { ChangeGroup } from "@/lib/claude-data-partner/types";
import { DiffCard } from "./DiffCard";

type DiffGroupProps = {
  group: ChangeGroup;
  approvedIds: Set<string>;
  onToggleChange: (id: string, checked: boolean) => void;
  onToggleGroup: (group: ChangeGroup, checked: boolean) => void;
  disabled?: boolean;
};

export function DiffGroup({ group, approvedIds, onToggleChange, onToggleGroup, disabled }: DiffGroupProps) {
  const actionableChanges = group.changes.filter((c) => c.operation !== "SKIP");
  const allChecked = actionableChanges.length > 0 && actionableChanges.every((c) => approvedIds.has(c.id));
  const someChecked = actionableChanges.some((c) => approvedIds.has(c.id));

  if (group.changes.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: "10px",
        overflow: "hidden",
        background: "#f9fafb",
      }}
    >
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 16px",
          borderBottom: "1px solid var(--color-border, #e5e7eb)",
          background: "#f3f4f6",
        }}
      >
        {group.mustApplyTogether ? (
          <span title="These changes must be applied together" style={{ fontSize: "14px" }}>
            🔒
          </span>
        ) : (
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = !allChecked && someChecked;
            }}
            onChange={(e) => onToggleGroup(group, e.target.checked)}
            disabled={disabled || actionableChanges.length === 0}
          />
        )}
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
          {group.label}
        </span>
        {group.mustApplyTogether && (
          <span style={{ fontSize: "11px", color: "#6b7280" }}>
            — must apply together
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: "11px", color: "#6b7280" }}>
          {actionableChanges.length} change{actionableChanges.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Change cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 16px" }}>
        {group.changes.map((change) => (
          <DiffCard
            key={change.id}
            change={change}
            checked={approvedIds.has(change.id)}
            onChange={onToggleChange}
            disabled={disabled || (group.mustApplyTogether && !allChecked)}
          />
        ))}
      </div>

      {group.mustApplyTogether && (
        <div style={{ padding: "0 16px 12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            type="button"
            className="btn"
            style={{ fontSize: "12px" }}
            disabled={disabled}
            onClick={() => onToggleGroup(group, true)}
          >
            Apply group
          </button>
          <button
            type="button"
            className="btn"
            style={{ fontSize: "12px" }}
            disabled={disabled}
            onClick={() => onToggleGroup(group, false)}
          >
            Skip group
          </button>
        </div>
      )}
    </div>
  );
}
