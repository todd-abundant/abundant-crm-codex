"use client";

import * as React from "react";

type SurveySession = {
  id: string;
  title: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  responseCount: number;
  sharePath: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusLabel(status: SurveySession["status"]) {
  if (status === "LIVE") return "Live";
  if (status === "CLOSED") return "Closed";
  return "Draft";
}

export function ScreeningSurveySessionSelector({
  companyId
}: {
  companyId: string;
}) {
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sessions, setSessions] = React.useState<SurveySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = React.useState("");
  const [origin, setOrigin] = React.useState("");

  const loadSessions = React.useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/screening-surveys`, {
        cache: "no-store"
      });
      const payload = (await res.json()) as { sessions?: SurveySession[]; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to load surveys");
      }
      const records = Array.isArray(payload.sessions) ? payload.sessions : [];
      setSessions(records);
      setSelectedSessionId((current) => {
        const selectedStillExists = records.some((entry) => entry.id === current);
        if (selectedStillExists) return current;
        const defaultSelection =
          records.find((entry) => entry.status === "LIVE") ||
          records[0] ||
          null;
        return defaultSelection?.id || "";
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load surveys"
      });
      setSessions([]);
      setSelectedSessionId("");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const selectedSession = sessions.find((entry) => entry.id === selectedSessionId) || null;

  async function copyLink(path: string) {
    const fullUrl = origin ? `${origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setStatus({ kind: "ok", text: "Survey link copied." });
    } catch {
      setStatus({ kind: "error", text: "Unable to copy link. Copy manually instead." });
    }
  }

  return (
    <section className="screening-survey-selector">
      <div className="pipeline-card-head">
        <strong>Survey Session</strong>
        <button className="ghost small" type="button" onClick={() => void loadSessions()} disabled={loading}>
          Refresh
        </button>
      </div>

      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}
      {loading ? <p className="muted">Loading survey sessions...</p> : null}

      {!loading && sessions.length === 0 ? (
        <p className="muted">No surveys created yet. Create them under Administration.</p>
      ) : null}

      {!loading && sessions.length > 0 ? (
        <>
          <label htmlFor={`screening-survey-session-select-${companyId}`}>Select survey</label>
          <select
            id={`screening-survey-session-select-${companyId}`}
            value={selectedSessionId}
            onChange={(event) => setSelectedSessionId(event.target.value)}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} ({statusLabel(session.status)})
              </option>
            ))}
          </select>

          {selectedSession ? (
            <div className="screening-survey-selector-meta">
              <p className="muted">
                Status: {statusLabel(selectedSession.status)} • Responses: {selectedSession.responseCount} • Updated:{" "}
                {formatDate(selectedSession.updatedAt)}
              </p>
              <div className="actions">
                <a className="ghost small" href={selectedSession.sharePath} target="_blank" rel="noreferrer">
                  Open Survey
                </a>
                <button className="ghost small" type="button" onClick={() => void copyLink(selectedSession.sharePath)}>
                  Copy Link
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
