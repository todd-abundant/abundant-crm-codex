"use client";

import * as React from "react";

type ScanControlsProps = {
  onScan: (windowDays: number) => void;
  onCommand: (input: string) => void;
  loading: boolean;
};

export function ScanControls({ onScan, onCommand, loading }: ScanControlsProps) {
  const [commandInput, setCommandInput] = React.useState("");

  function handleCommand() {
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    onCommand(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommand();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          onClick={() => onScan(1)}
          disabled={loading}
          style={{ fontWeight: 500 }}
        >
          Scan last 24 hours
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onScan(2)}
          disabled={loading}
          style={{ fontWeight: 500 }}
        >
          Scan last 48 hours
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onScan(7)}
          disabled={loading}
          style={{ fontWeight: 500 }}
        >
          Scan last week
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label
          htmlFor="cdp-command-input"
          style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-label, #6b7280)" }}
        >
          Or type a command
        </label>
        <textarea
          id="cdp-command-input"
          rows={3}
          placeholder={`e.g. "Add Systole Health to the intake pipeline with Simin Lee as contact"`}
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border, #d1d5db)",
            borderRadius: "6px",
            fontSize: "14px",
            fontFamily: "inherit",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--color-muted, #9ca3af)" }}>
            Tip: ⌘+Enter to run
          </span>
          <button
            type="button"
            className="btn"
            onClick={handleCommand}
            disabled={loading || !commandInput.trim()}
            style={{ fontWeight: 600 }}
          >
            Run →
          </button>
        </div>
      </div>
    </div>
  );
}
