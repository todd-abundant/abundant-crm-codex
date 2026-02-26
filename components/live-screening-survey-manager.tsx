"use client";

import * as React from "react";

type SurveyQuestion = {
  id: string;
  category: string;
  prompt: string;
  scaleMin: number;
  scaleMax: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SurveySessionQuestion = {
  sessionQuestionId: string;
  questionId: string;
  displayOrder: number;
  category: string;
  prompt: string;
  scaleMin: number;
  scaleMax: number;
};

type SurveySession = {
  id: string;
  title: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  responseCount: number;
  lastResponseAt: string | null;
  sharePath: string;
  questions: SurveySessionQuestion[];
};

type SurveyDataPayload = {
  company: {
    id: string;
    name: string;
  };
  questionBank: SurveyQuestion[];
  sessions: SurveySession[];
  activeSessionId: string | null;
};

const quickCategorySuggestions = [
  "Desirability",
  "Feasibility",
  "Impact",
  "Viability",
  "Co-Development"
];

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

function sessionStatusLabel(status: SurveySession["status"]) {
  if (status === "LIVE") return "Live";
  if (status === "CLOSED") return "Closed";
  return "Draft";
}

export function LiveScreeningSurveyManager({
  companyId
}: {
  companyId: string;
}) {
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [questionBank, setQuestionBank] = React.useState<SurveyQuestion[]>([]);
  const [sessions, setSessions] = React.useState<SurveySession[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = React.useState<Record<string, boolean>>({});
  const [sessionTitle, setSessionTitle] = React.useState("");
  const [creatingSession, setCreatingSession] = React.useState(false);
  const [updatingSessionId, setUpdatingSessionId] = React.useState<string | null>(null);
  const [creatingQuestion, setCreatingQuestion] = React.useState(false);
  const [newQuestionCategory, setNewQuestionCategory] = React.useState("Desirability");
  const [newQuestionPrompt, setNewQuestionPrompt] = React.useState("");
  const [origin, setOrigin] = React.useState("");

  const loadSurveyData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/screening-surveys`, {
        cache: "no-store"
      });
      const payload = (await res.json()) as SurveyDataPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to load screening surveys");

      const nextQuestionBank = payload.questionBank || [];
      const nextSessions = payload.sessions || [];
      setQuestionBank(nextQuestionBank);
      setSessions(nextSessions);

      const activeSession =
        nextSessions.find((entry) => entry.status === "LIVE") || nextSessions[0] || null;
      const defaultSelected = activeSession
        ? activeSession.questions.map((entry) => entry.questionId)
        : nextQuestionBank.filter((entry) => entry.isActive).map((entry) => entry.id);
      setSelectedQuestionIds(
        defaultSelected.reduce<Record<string, boolean>>((accumulator, questionId) => {
          accumulator[questionId] = true;
          return accumulator;
        }, {})
      );
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load screening surveys"
      });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    void loadSurveyData();
  }, [loadSurveyData]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const selectedQuestionCount = Object.values(selectedQuestionIds).filter(Boolean).length;
  const liveSession = sessions.find((entry) => entry.status === "LIVE") || null;
  const groupedQuestionBank = React.useMemo(() => {
    const map = new Map<string, SurveyQuestion[]>();
    for (const question of questionBank) {
      if (!question.isActive) continue;
      const existing = map.get(question.category) || [];
      existing.push(question);
      map.set(question.category, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [questionBank]);

  async function createSession(openNow: boolean) {
    const questionIds = Object.entries(selectedQuestionIds)
      .filter(([, value]) => value)
      .map(([questionId]) => questionId);
    if (questionIds.length === 0) {
      setStatus({ kind: "error", text: "Select at least one survey question." });
      return;
    }

    setCreatingSession(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/screening-surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionTitle.trim() || undefined,
          questionIds,
          openNow
        })
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to create survey session");
      setSessionTitle("");
      setStatus({
        kind: "ok",
        text: openNow ? "Live survey launched." : "Draft survey session created."
      });
      await loadSurveyData();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create survey session"
      });
    } finally {
      setCreatingSession(false);
    }
  }

  async function updateSessionStatus(sessionId: string, nextStatus: "DRAFT" | "LIVE" | "CLOSED") {
    setUpdatingSessionId(sessionId);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/screening-surveys/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to update session");
      setStatus({
        kind: "ok",
        text: nextStatus === "LIVE" ? "Session is now live." : "Session updated."
      });
      await loadSurveyData();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update session"
      });
    } finally {
      setUpdatingSessionId(null);
    }
  }

  async function createQuestion() {
    if (!newQuestionCategory.trim() || !newQuestionPrompt.trim()) {
      setStatus({ kind: "error", text: "Category and question prompt are required." });
      return;
    }

    setCreatingQuestion(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/screening-surveys/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newQuestionCategory.trim(),
          prompt: newQuestionPrompt.trim(),
          scaleMin: 1,
          scaleMax: 10
        })
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to create question");
      setNewQuestionPrompt("");
      setStatus({ kind: "ok", text: "Question added to survey bank." });
      await loadSurveyData();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create question"
      });
    } finally {
      setCreatingQuestion(false);
    }
  }

  async function copyShareLink(path: string) {
    const url = origin ? `${origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ kind: "ok", text: "Survey link copied." });
    } catch {
      setStatus({ kind: "error", text: "Unable to copy link. Please copy it manually." });
    }
  }

  return (
    <section className="screening-live-survey-manager">
      <div className="pipeline-card-head">
        <h3>Live Webinar Survey</h3>
        <button className="ghost small" type="button" onClick={() => void loadSurveyData()} disabled={loading}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Launch a live link or QR code for webinar participants. Responses sync into screening quantitative feedback.
      </p>

      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}
      {loading ? <p className="muted">Loading live survey configuration...</p> : null}

      {!loading ? (
        <>
          {liveSession ? (
            <article className="screening-live-survey-session-card">
              <div>
                <p className="detail-label">Current Live Session</p>
                <h4>{liveSession.title}</h4>
                <p className="muted">
                  {liveSession.responseCount} responses • opened {formatDate(liveSession.openedAt)}
                </p>
                <div className="actions">
                  <a className="secondary small" href={liveSession.sharePath} target="_blank" rel="noreferrer">
                    Open Survey
                  </a>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => void copyShareLink(liveSession.sharePath)}
                  >
                    Copy Link
                  </button>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => void updateSessionStatus(liveSession.id, "CLOSED")}
                    disabled={updatingSessionId === liveSession.id}
                  >
                    Close Session
                  </button>
                </div>
              </div>
              <div className="screening-live-survey-qr-wrap">
                {origin ? (
                  <img
                    className="screening-live-survey-qr"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      `${origin}${liveSession.sharePath}`
                    )}`}
                    alt="QR code for live survey link"
                  />
                ) : (
                  <p className="muted">QR loading...</p>
                )}
              </div>
            </article>
          ) : (
            <p className="muted">No live session currently running.</p>
          )}

          <div className="screening-live-survey-grid">
            <article className="screening-live-survey-builder">
              <p className="detail-label">Launch New Session</p>
              <label htmlFor={`survey-session-title-${companyId}`}>Session title (optional)</label>
              <input
                id={`survey-session-title-${companyId}`}
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                placeholder="Q1 screening webinar survey"
              />
              <p className="muted">{selectedQuestionCount} selected questions</p>
              <div className="actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void createSession(true)}
                  disabled={creatingSession || selectedQuestionCount === 0}
                >
                  {creatingSession ? "Launching..." : "Launch Live Survey"}
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => void createSession(false)}
                  disabled={creatingSession || selectedQuestionCount === 0}
                >
                  Save Draft
                </button>
              </div>
            </article>

            <article className="screening-live-survey-questions">
              <p className="detail-label">Question Bank</p>
              {groupedQuestionBank.length === 0 ? <p className="muted">No active questions found.</p> : null}
              {groupedQuestionBank.map(([category, entries]) => (
                <div key={category} className="screening-live-survey-question-category">
                  <strong>{category}</strong>
                  <div className="screening-live-survey-question-list">
                    {entries.map((entry) => (
                      <label key={entry.id} className="screening-live-survey-question-item">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedQuestionIds[entry.id])}
                          onChange={(event) =>
                            setSelectedQuestionIds((current) => ({
                              ...current,
                              [entry.id]: event.target.checked
                            }))
                          }
                        />
                        <span>{entry.prompt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          </div>

          <article className="screening-live-survey-builder">
            <p className="detail-label">Add Question To Bank</p>
            <div className="detail-grid">
              <div>
                <label htmlFor={`survey-question-category-${companyId}`}>Category</label>
                <input
                  id={`survey-question-category-${companyId}`}
                  list={`survey-question-categories-${companyId}`}
                  value={newQuestionCategory}
                  onChange={(event) => setNewQuestionCategory(event.target.value)}
                  placeholder="Category"
                />
                <datalist id={`survey-question-categories-${companyId}`}>
                  {quickCategorySuggestions.map((entry) => (
                    <option key={entry} value={entry} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor={`survey-question-prompt-${companyId}`}>Prompt</label>
                <input
                  id={`survey-question-prompt-${companyId}`}
                  value={newQuestionPrompt}
                  onChange={(event) => setNewQuestionPrompt(event.target.value)}
                  placeholder="How urgent is this problem for your team?"
                />
              </div>
            </div>
            <div className="actions">
              <button className="secondary" type="button" onClick={() => void createQuestion()} disabled={creatingQuestion}>
                {creatingQuestion ? "Adding..." : "Add Question"}
              </button>
            </div>
          </article>

          <article className="screening-live-survey-session-list">
            <p className="detail-label">Recent Sessions</p>
            {sessions.length === 0 ? <p className="muted">No sessions created yet.</p> : null}
            {sessions.map((session) => (
              <div key={session.id} className="screening-live-survey-session-row">
                <div>
                  <strong>{session.title}</strong>
                  <p className="muted">
                    {sessionStatusLabel(session.status)} • {session.responseCount} responses • updated{" "}
                    {formatDate(session.updatedAt)}
                  </p>
                </div>
                <div className="actions">
                  <a className="ghost small" href={session.sharePath} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <button className="ghost small" type="button" onClick={() => void copyShareLink(session.sharePath)}>
                    Copy
                  </button>
                  {session.status !== "LIVE" ? (
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => void updateSessionStatus(session.id, "LIVE")}
                      disabled={updatingSessionId === session.id}
                    >
                      Go Live
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </article>
        </>
      ) : null}
    </section>
  );
}
