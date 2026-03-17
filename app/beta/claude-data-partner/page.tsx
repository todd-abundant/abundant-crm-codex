"use client";

import * as React from "react";
import type { ChangeSet, ChangeGroup, WriteLog } from "@/lib/claude-data-partner/types";
import type { ScanDebugInfo } from "@/app/api/beta/claude-data-partner/scan/route";
import type { DiagnosticsResult } from "@/app/api/beta/claude-data-partner/diagnostics/route";
import { ScanControls } from "./components/ScanControls";
import { DiffGroup } from "./components/DiffGroup";
import { WriteLogView } from "./components/WriteLog";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? "#16a34a" : warn ? "#d97706" : "#dc2626";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        marginTop: 2,
      }}
    />
  );
}

// ─── Diagnostics panel ────────────────────────────────────────────────────────

function DiagnosticsPanel({
  diag,
  loading,
  onRefresh,
}: {
  diag: DiagnosticsResult | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (loading) {
    return (
      <div style={{ fontSize: "13px", color: "#6b7280", padding: "10px 0 4px" }}>
        Checking connections…
      </div>
    );
  }

  if (!diag) return null;

  const allOk = diag.llm.ok && diag.auth.googleSession && diag.gmail?.ok && diag.calendar?.ok && diag.drive?.ok;
  const someIssue = !allOk;

  return (
    <div
      style={{
        border: `1px solid ${someIssue ? "#fca5a5" : "#d1fae5"}`,
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: "20px",
        fontSize: "13px",
      }}
    >
      {/* Summary bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          background: someIssue ? "#fef2f2" : "#f0fdf4",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusDot ok={!someIssue} />
        <span style={{ fontWeight: 600, color: someIssue ? "#991b1b" : "#166534" }}>
          {someIssue ? "Connection issue — expand to see details" : "All systems ready"}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: "16px", color: "#6b7280", fontSize: "12px" }}>
          <span>LLM {diag.llm.ok ? "✅" : "❌"}</span>
          <span>Gmail {diag.gmail?.ok ? `✅ ${diag.gmail.fetched} msgs` : "❌"}</span>
          <span>Calendar {diag.calendar?.ok ? `✅ ${diag.calendar.fetched} events` : "❌"}</span>
          <span>Drive {diag.drive?.ok ? `✅ ${diag.drive.fetched} docs` : diag.drive === null ? "—" : "❌"}</span>
        </div>
        <span style={{ color: "#9ca3af", fontSize: "11px" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "14px 16px", background: "#fff", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* LLM */}
          <DiagSection
            label="LLM (Claude)"
            ok={diag.llm.ok}
            detail={diag.llm.ok ? `Model: ${diag.llm.model}` : `Error: ${diag.llm.error}`}
          />

          {/* Google session */}
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <StatusDot ok={diag.auth.googleSession} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: "#111827" }}>Google OAuth session</span>
              {diag.auth.googleSession ? (
                <span style={{ color: "#6b7280" }}>Connected as {diag.auth.userEmail}</span>
              ) : (
                <>
                  <span style={{ color: "#6b7280" }}>Not connected</span>
                  <a
                    href="/api/auth/google/login?next=/beta/claude-data-partner"
                    style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "4px", background: "#4f46e5", color: "#fff", textDecoration: "none", fontWeight: 600 }}
                  >
                    Connect Google
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Gmail */}
          {diag.gmail ? (
            <div>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <StatusDot ok={diag.gmail.ok} />
                <span style={{ fontWeight: 600, color: "#111827" }}>Gmail</span>
                <span style={{ color: "#6b7280" }}>
                  {diag.gmail.ok ? `${diag.gmail.fetched} messages fetched in window` : `Error: ${diag.gmail.error}`}
                </span>
                {!diag.gmail.ok && diag.gmail.error?.includes('401') && (
                  <a
                    href="/api/auth/google/login?next=/beta/claude-data-partner"
                    style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "4px", background: "#4f46e5", color: "#fff", textDecoration: "none", fontWeight: 600 }}
                  >
                    Re-connect Google
                  </a>
                )}
              </div>
              {diag.gmail.ok && diag.gmail.sample.length > 0 && (
                <div style={{ marginTop: "6px", paddingLeft: "18px" }}>
                  <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                    Sample messages Claude will analyze:
                  </div>
                  {diag.gmail.sample.map((m, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#374151", padding: "2px 0" }}>
                      · <strong>{m.subject}</strong> — {m.from.split("<")[0].trim()} ({m.date.slice(0, 16)})
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <DiagSection label="Gmail" ok={false} warn detail="Not checked — no Google session" />
          )}

          {/* Calendar */}
          {diag.calendar ? (
            <div>
              <DiagSection
                label="Calendar"
                ok={diag.calendar.ok}
                detail={diag.calendar.ok ? `${diag.calendar.fetched} events fetched in window` : `Error: ${diag.calendar.error}`}
              />
              {diag.calendar.ok && diag.calendar.sample.length > 0 && (
                <div style={{ marginTop: "6px", paddingLeft: "18px" }}>
                  <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                    Sample events Claude will analyze:
                  </div>
                  {diag.calendar.sample.map((e, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#374151", padding: "2px 0" }}>
                      · <strong>{e.summary}</strong> — {e.date.slice(0, 10)}{" "}
                      {e.attendeeCount > 0 ? `(${e.attendeeCount} attendees)` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <DiagSection label="Calendar" ok={false} warn detail="Not checked — no Google session" />
          )}

          {/* Drive */}
          {diag.drive ? (
            <div>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <StatusDot ok={diag.drive.ok} />
                <span style={{ fontWeight: 600, color: "#111827" }}>Drive transcripts</span>
                <span style={{ color: "#6b7280" }}>
                  {diag.drive.ok
                    ? `${diag.drive.fetched} transcript doc${diag.drive.fetched !== 1 ? "s" : ""} found in window`
                    : `Error: ${diag.drive.error}`}
                </span>
                {!diag.drive.ok && diag.drive.error?.includes('403') && (
                  <a
                    href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "4px", background: "#f59e0b", color: "#fff", textDecoration: "none", fontWeight: 600 }}
                  >
                    Enable Drive API
                  </a>
                )}
              </div>
              {diag.drive.ok && diag.drive.sample.length > 0 && (
                <div style={{ marginTop: "6px", paddingLeft: "18px" }}>
                  <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                    Transcripts Claude will analyze:
                  </div>
                  {diag.drive.sample.map((d, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#374151", padding: "2px 0" }}>
                      · <strong>{d.title}</strong>{d.modifiedAt ? ` — ${d.modifiedAt.slice(0, 10)}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {diag.drive.ok && diag.drive.fetched === 0 && (
                <div style={{ marginTop: "4px", paddingLeft: "18px", fontSize: "12px", color: "#9ca3af" }}>
                  No transcript docs found in this window. Google Meet transcripts are saved as Google Docs named &ldquo;Transcript — [meeting name]&rdquo;.
                </div>
              )}
            </div>
          ) : (
            <DiagSection label="Drive transcripts" ok={false} warn detail="Not checked — no Google session" />
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            style={{ alignSelf: "flex-start", fontSize: "12px", cursor: "pointer", padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: "4px", background: "#f9fafb" }}
          >
            Re-check
          </button>
        </div>
      )}
    </div>
  );
}

function DiagSection({ label, ok, warn, detail }: { label: string; ok: boolean; warn?: boolean; detail: string }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <StatusDot ok={ok} warn={warn} />
      <div>
        <span style={{ fontWeight: 600, color: "#111827" }}>{label}</span>
        <span style={{ color: "#6b7280", marginLeft: "8px" }}>{detail}</span>
      </div>
    </div>
  );
}

// ─── Scan debug panel ─────────────────────────────────────────────────────────

function ScanDebugPanel({ debug }: { debug: ScanDebugInfo }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", marginBottom: "16px", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f9fafb", border: "none", cursor: "pointer", fontSize: "12px", color: "#6b7280", textAlign: "left" }}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 600 }}>Scan results</span>
        <span style={{ marginLeft: "auto" }}>
          Gmail: {debug.gmail?.fetched ?? "—"} msgs · Calendar: {debug.calendar?.fetched ?? "—"} events · Drive: {debug.drive?.fetched ?? "—"} docs ·{" "}
          {debug.totalCandidates} candidates → {debug.totalChanges} changes
        </span>
      </button>
      {open && (
        <div style={{ padding: "10px 12px", background: "#fff", display: "flex", flexDirection: "column", gap: "5px" }}>
          {debug.gmail && (
            <Row label="Gmail" value={debug.gmail.error ? `❌ ${debug.gmail.error}` : `✅ ${debug.gmail.fetched} fetched → ${debug.gmail.candidates ?? 0} CRM candidates`} err={!!debug.gmail.error} />
          )}
          {debug.calendar && (
            <Row label="Calendar" value={debug.calendar.error ? `❌ ${debug.calendar.error}` : `✅ ${debug.calendar.fetched} fetched → ${debug.calendar.candidates ?? 0} CRM candidates`} err={!!debug.calendar.error} />
          )}
          {debug.drive && (
            <Row label="Drive transcripts" value={debug.drive.error ? `❌ ${debug.drive.error}` : `✅ ${debug.drive.fetched} fetched → ${debug.drive.candidates ?? 0} CRM candidates`} err={!!debug.drive.error} />
          )}
          {debug.llmError && <Row label="LLM error" value={`❌ ${debug.llmError}`} err />}
          <Row label="Total candidates" value={String(debug.totalCandidates)} />
          <Row label="Planned changes" value={String(debug.totalChanges)} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, err }: { label: string; value: string; err?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <span style={{ color: "#9ca3af", minWidth: "120px", flexShrink: 0 }}>{label}:</span>
      <span style={{ color: err ? "#b91c1c" : "#374151", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

// ─── Loading steps ────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "done" | "error";
type LoadingStep = { label: string; status: StepStatus; detail?: string };

function Spinner() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return <span style={{ fontFamily: "monospace", color: "#6366f1" }}>{frames[tick % frames.length]}</span>;
}

function LoadingSteps({ steps }: { steps: LoadingStep[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "32px 0" }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "10px", fontSize: "14px" }}>
          <span style={{ fontSize: "15px", minWidth: 20, textAlign: "center" }}>
            {step.status === "running" ? <Spinner /> : step.status === "done" ? "✅" : step.status === "error" ? "❌" : "·"}
          </span>
          <span style={{
            color: step.status === "error" ? "#b91c1c" : step.status === "done" ? "#374151" : step.status === "running" ? "#1e40af" : "#9ca3af",
            fontWeight: step.status === "running" ? 600 : 400,
          }}>
            {step.label}
          </span>
          {step.detail && (
            <span style={{ fontSize: "12px", color: step.status === "error" ? "#b91c1c" : "#6b7280" }}>
              — {step.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageState =
  | { kind: "idle" }
  | { kind: "loading"; steps: LoadingStep[] }
  | { kind: "plan"; changeSet: ChangeSet; approvedIds: Set<string>; debug?: ScanDebugInfo }
  | { kind: "applying" }
  | { kind: "done"; log: WriteLog }
  | { kind: "error"; message: string; debug?: ScanDebugInfo };

export default function ClaudeDataPartnerPage() {
  const [state, setState] = React.useState<PageState>({ kind: "idle" });
  const [diag, setDiag] = React.useState<DiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = React.useState(true);

  async function runDiagnostics(windowDays = 7) {
    setDiagLoading(true);
    try {
      const res = await fetch(`/api/beta/claude-data-partner/diagnostics?windowDays=${windowDays}`);
      if (res.ok) setDiag(await res.json() as DiagnosticsResult);
    } catch { /* silent */ }
    finally { setDiagLoading(false); }
  }

  React.useEffect(() => { void runDiagnostics(); }, []);

  async function handleScan(windowDays: number) {
    const windowLabel = windowDays === 1 ? "24 hours" : windowDays === 2 ? "48 hours" : "last week";
    setState({ kind: "loading", steps: [
      { label: `Starting scan (${windowLabel})…`, status: "running" },
    ]});

    try {
      const res = await fetch("/api/beta/claude-data-partner/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays, sources: ["gmail", "calendar", "drive"] }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json() as { message?: string };
        setState({ kind: "error", message: data.message || "Scan failed" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Steps managed locally, pushed to state on each event
      const steps: LoadingStep[] = [];

      const setSteps = (next: LoadingStep[]) => {
        setState({ kind: "loading", steps: [...next] });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; label?: string; detail?: string; changeSet?: ChangeSet; debug?: ScanDebugInfo; message?: string };
          try { event = JSON.parse(line) as typeof event; } catch { continue; }

          if (event.type === "progress") {
            // Mark previous running step as done if still running
            const prev = [...steps].reverse().find((s) => s.status === "running");
            if (prev) prev.status = "done";
            steps.push({ label: event.label ?? "Working…", status: "running" });
            setSteps(steps);

          } else if (event.type === "progress_done") {
            // Resolve the most recent running step
            const running = [...steps].reverse().find((s) => s.status === "running");
            if (running) {
              running.status = event.detail?.startsWith("Error") ? "error" : "done";
              if (event.label) running.label = event.label;
              if (event.detail) running.detail = event.detail;
            }
            setSteps(steps);

          } else if (event.type === "result") {
            // Mark any remaining running step done
            for (const s of steps) { if (s.status === "running") s.status = "done"; }
            steps.push({ label: "Done — building change plan", status: "done" });
            setSteps(steps);
            await new Promise((r) => setTimeout(r, 400));
            initPlan(event.changeSet as ChangeSet, event.debug);
            return;

          } else if (event.type === "error") {
            for (const s of steps) { if (s.status === "running") s.status = "error"; }
            setSteps(steps);
            setState({ kind: "error", message: event.message ?? "Scan failed", debug: event.debug });
            return;
          }
        }
      }
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Scan failed" });
    }
  }

  async function handleCommand(input: string) {
    setState({ kind: "loading", steps: [
      { label: "Claude is parsing your command…", status: "running" },
      { label: "Resolving against database…", status: "pending" },
    ]});

    try {
      const res = await fetch("/api/beta/claude-data-partner/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json() as { changeSet?: ChangeSet; error?: string };

      if (!res.ok) {
        setState({ kind: "error", message: data.error || "Command failed" });
        return;
      }

      setState({ kind: "loading", steps: [
        { label: "Claude parsed your command", status: "done" },
        { label: "Resolving against database…", status: "running" },
      ]});
      await new Promise((r) => setTimeout(r, 300));
      setState({ kind: "loading", steps: [
        { label: "Claude parsed your command", status: "done" },
        { label: "Resolved against database", status: "done" },
      ]});
      await new Promise((r) => setTimeout(r, 200));

      initPlan(data.changeSet as ChangeSet);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Command failed" });
    }
  }

  function initPlan(changeSet: ChangeSet, debug?: ScanDebugInfo) {
    const approvedIds = new Set<string>();
    for (const group of changeSet.groups) {
      for (const change of group.changes) {
        if (change.userApproved) approvedIds.add(change.id);
      }
    }
    setState({ kind: "plan", changeSet, approvedIds, debug });
  }

  function handleToggleChange(id: string, checked: boolean) {
    if (state.kind !== "plan") return;
    const next = new Set(state.approvedIds);
    checked ? next.add(id) : next.delete(id);
    setState({ ...state, approvedIds: next });
  }

  function handleToggleGroup(group: ChangeGroup, checked: boolean) {
    if (state.kind !== "plan") return;
    const next = new Set(state.approvedIds);
    for (const change of group.changes) {
      if (change.operation === "SKIP") continue;
      checked ? next.add(change.id) : next.delete(change.id);
    }
    setState({ ...state, approvedIds: next });
  }

  async function handleApply() {
    if (state.kind !== "plan") return;
    const markedChangeSet: ChangeSet = {
      ...state.changeSet,
      groups: state.changeSet.groups.map((g) => ({
        ...g,
        changes: g.changes.map((c) => ({ ...c, userApproved: state.approvedIds.has(c.id) })),
      })),
    };
    setState({ kind: "applying" });
    try {
      const res = await fetch("/api/beta/claude-data-partner/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSet: markedChangeSet }),
      });
      const data = await res.json() as { writeLog?: WriteLog; error?: string };
      if (!res.ok) throw new Error(data.error || "Apply failed");
      setState({ kind: "done", log: data.writeLog as WriteLog });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Apply failed" });
    }
  }

  const approvedCount =
    state.kind === "plan"
      ? [...state.approvedIds].filter((id) => {
          const ch = state.changeSet.groups.flatMap((g) => g.changes).find((c) => c.id === id);
          return ch && ch.operation !== "SKIP";
        }).length
      : 0;

  const showControls = state.kind === "idle" || state.kind === "error";

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>Claude Data Partner</h1>
          <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: "#ede9fe", color: "#5b21b6", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Beta
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>
          Scans your Gmail and Calendar for CRM signals, then proposes changes for your review before writing anything.
        </p>
      </div>

      {/* Diagnostics — always shown at idle/error */}
      {showControls && (
        <DiagnosticsPanel diag={diag} loading={diagLoading} onRefresh={() => runDiagnostics()} />
      )}

      {/* Controls */}
      {showControls && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px", background: "#fff", marginBottom: "20px" }}>
          <ScanControls onScan={handleScan} onCommand={handleCommand} loading={false} />
        </div>
      )}

      {/* Error */}
      {state.kind === "error" && (
        <>
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "12px 16px", color: "#991b1b", fontSize: "14px", marginBottom: "16px", wordBreak: "break-word" }}>
            {state.message}
          </div>
          {state.debug && <ScanDebugPanel debug={state.debug} />}
        </>
      )}

      {/* Loading */}
      {state.kind === "loading" && <LoadingSteps steps={state.steps} />}

      {/* Applying */}
      {state.kind === "applying" && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280", fontSize: "14px" }}>
          <div style={{ marginBottom: "12px", fontSize: "24px" }}>✍️</div>
          Writing changes to database…
        </div>
      )}

      {/* Plan */}
      {state.kind === "plan" && (
        <>
          {state.debug && <ScanDebugPanel debug={state.debug} />}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span style={{ fontSize: "15px", fontWeight: 600 }}>
                {state.changeSet.totalChanges} proposed change{state.changeSet.totalChanges !== 1 ? "s" : ""}
              </span>
              {approvedCount > 0 && (
                <span style={{ fontSize: "13px", color: "#6b7280", marginLeft: "10px" }}>{approvedCount} selected</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="btn" onClick={() => setState({ kind: "idle" })} style={{ fontSize: "13px" }}>
                Start over
              </button>
              <button type="button" className="btn" onClick={handleApply} disabled={approvedCount === 0} style={{ fontSize: "13px", fontWeight: 600 }}>
                Apply selected ({approvedCount})
              </button>
            </div>
          </div>

          {state.changeSet.totalChanges === 0 ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "32px", textAlign: "center", color: "#6b7280", fontSize: "14px" }}>
              No new CRM-relevant changes found in this window. Try a longer window or type a specific command.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {state.changeSet.groups.map((group) => (
                <DiffGroup key={group.id} group={group} approvedIds={state.approvedIds} onToggleChange={handleToggleChange} onToggleGroup={handleToggleGroup} disabled={false} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Write log */}
      {state.kind === "done" && (
        <>
          <WriteLogView log={state.log} />
          <div style={{ marginTop: "20px" }}>
            <button type="button" className="btn" onClick={() => setState({ kind: "idle" })} style={{ fontSize: "13px" }}>
              Run another scan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
