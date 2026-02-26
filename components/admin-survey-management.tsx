"use client";

import * as React from "react";

type AdminSurveyCompany = {
  id: string;
  name: string;
  phase: string;
  phaseLabel: string;
  isScreeningStage: boolean;
};

type SurveyQuestionBankItem = {
  id: string;
  category: string;
  prompt: string;
  instructions: string | null;
  scaleMin: number;
  scaleMax: number;
  isActive: boolean;
};

type SurveySessionQuestion = {
  sessionQuestionId: string;
  questionId: string;
  displayOrder: number;
  category: string;
  prompt: string;
  instructions: string | null;
  scaleMin: number;
  scaleMax: number;
};

type SurveySession = {
  id: string;
  title: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  responseCount: number;
  sharePath: string;
  questions: SurveySessionQuestion[];
};

type SurveyDraftQuestion = {
  questionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  scaleMin: number;
  scaleMax: number;
};

type SurveySessionDraft = {
  id: string;
  title: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  responseCount: number;
  sharePath: string;
  questions: SurveyDraftQuestion[];
};

type SurveyDataPayload = {
  questionBank: SurveyQuestionBankItem[];
  sessions: SurveySession[];
  error?: string;
};

type SurveyResultsAnswer = {
  answerId: string;
  sessionQuestionId: string;
  questionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  score: number;
};

type SurveyResultsSubmission = {
  submissionId: string;
  submittedAt: string;
  participantName: string;
  participantEmail: string | null;
  contactId: string | null;
  contactName: string | null;
  contactTitle: string | null;
  healthSystemId: string | null;
  healthSystemName: string;
  answerCount: number;
  averageScore: number | null;
  answers: SurveyResultsAnswer[];
};

type SurveyResultsCategoryAverage = {
  category: string;
  responseCount: number;
  averageScore: number | null;
};

type SurveyResultsQuestionAverage = {
  sessionQuestionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  responseCount: number;
  averageScore: number | null;
};

type SurveyResultsPayload = {
  session: {
    id: string;
    companyId: string;
    title: string;
    status: "DRAFT" | "LIVE" | "CLOSED";
    responseCount: number;
    questionCount: number;
    openedAt: string | null;
    closedAt: string | null;
    updatedAt: string;
    lastResponseAt: string | null;
  };
  submissions: SurveyResultsSubmission[];
  categoryAverages: SurveyResultsCategoryAverage[];
  questionAverages: SurveyResultsQuestionAverage[];
  error?: string;
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

function sessionStatusLabel(status: SurveySession["status"]) {
  if (status === "LIVE") return "Live";
  if (status === "CLOSED") return "Closed";
  return "Draft";
}

function normalizeCategory(value: string) {
  return value.trim() || "General";
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function orderedCategories(questions: SurveyDraftQuestion[]) {
  const order: string[] = [];
  for (const question of questions) {
    const category = normalizeCategory(question.category);
    if (!order.includes(category)) {
      order.push(category);
    }
  }
  return order;
}

function toDraft(session: SurveySession): SurveySessionDraft {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    responseCount: session.responseCount,
    sharePath: session.sharePath,
    questions: [...session.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((entry) => ({
        questionId: entry.questionId,
        category: normalizeCategory(entry.category),
        prompt: entry.prompt,
        instructions: normalizeOptionalText(entry.instructions),
        scaleMin: entry.scaleMin,
        scaleMax: entry.scaleMax
      }))
  };
}

function normalizeDraftPayload(draft: SurveySessionDraft) {
  return {
    title: draft.title.trim(),
    status: draft.status,
    questions: draft.questions.map((entry, index) => ({
      questionId: entry.questionId,
      category: normalizeCategory(entry.category),
      prompt: entry.prompt.trim() || "Untitled question",
      instructions: normalizeOptionalText(entry.instructions),
      displayOrder: index
    }))
  };
}

function normalizeSessionPayload(session: SurveySession) {
  return {
    title: session.title.trim(),
    status: session.status,
    questions: [...session.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((entry, index) => ({
        questionId: entry.questionId,
        category: normalizeCategory(entry.category),
        prompt: entry.prompt.trim() || "Untitled question",
        instructions: normalizeOptionalText(entry.instructions),
        displayOrder: index
      }))
  };
}

function questionIndexesForCategory(questions: SurveyDraftQuestion[], category: string) {
  const target = normalizeCategory(category);
  const indexes: number[] = [];
  for (let index = 0; index < questions.length; index += 1) {
    if (normalizeCategory(questions[index].category) === target) {
      indexes.push(index);
    }
  }
  return indexes;
}

function insertQuestionIntoCategory(
  questions: SurveyDraftQuestion[],
  category: string,
  question: SurveyDraftQuestion
) {
  const target = normalizeCategory(category);
  const indexes = questionIndexesForCategory(questions, target);
  if (indexes.length === 0) {
    return [...questions, { ...question, category: target }];
  }
  const insertIndex = indexes[indexes.length - 1] + 1;
  const next = [...questions];
  next.splice(insertIndex, 0, { ...question, category: target });
  return next;
}

export function AdminSurveyManagement() {
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [companies, setCompanies] = React.useState<AdminSurveyCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = React.useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState("");
  const [questionBank, setQuestionBank] = React.useState<SurveyQuestionBankItem[]>([]);
  const [sessions, setSessions] = React.useState<SurveySession[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(false);
  const [selectedSessionId, setSelectedSessionId] = React.useState("");
  const [sessionDraft, setSessionDraft] = React.useState<SurveySessionDraft | null>(null);
  const [newSurveyTitle, setNewSurveyTitle] = React.useState("");
  const [creatingSurvey, setCreatingSurvey] = React.useState(false);
  const [savingSurvey, setSavingSurvey] = React.useState(false);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [deletingSurveyId, setDeletingSurveyId] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [addExistingQuestionByCategory, setAddExistingQuestionByCategory] = React.useState<
    Record<string, string>
  >({});
  const [newQuestionPromptByCategory, setNewQuestionPromptByCategory] = React.useState<
    Record<string, string>
  >({});
  const [newQuestionInstructionsByCategory, setNewQuestionInstructionsByCategory] = React.useState<
    Record<string, string>
  >({});
  const [addingQuestionByCategory, setAddingQuestionByCategory] = React.useState<Record<string, boolean>>({});
  const [loadingResults, setLoadingResults] = React.useState(false);
  const [results, setResults] = React.useState<SurveyResultsPayload | null>(null);

  const selectedCompany = companies.find((entry) => entry.id === selectedCompanyId) || null;
  const selectedSession = sessions.find((entry) => entry.id === selectedSessionId) || null;
  const questionSetLocked = (sessionDraft?.responseCount || 0) > 0;

  const isDirty = React.useMemo(() => {
    if (!selectedSession || !sessionDraft) return false;
    return (
      JSON.stringify(normalizeDraftPayload(sessionDraft)) !==
      JSON.stringify(normalizeSessionPayload(selectedSession))
    );
  }, [selectedSession, sessionDraft]);

  const loadSessions = React.useCallback(
    async (companyId: string, preferredSessionId?: string) => {
      if (!companyId) {
        setQuestionBank([]);
        setSessions([]);
        setSelectedSessionId("");
        return;
      }

      setLoadingSessions(true);
      try {
        const res = await fetch(`/api/pipeline/opportunities/${companyId}/screening-surveys`, {
          cache: "no-store"
        });
        const payload = (await res.json()) as SurveyDataPayload;
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load surveys");
        }

        const nextQuestionBank = Array.isArray(payload.questionBank) ? payload.questionBank : [];
        const nextSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        setQuestionBank(nextQuestionBank);
        setSessions(nextSessions);
        setSelectedSessionId((current) => {
          if (preferredSessionId && nextSessions.some((entry) => entry.id === preferredSessionId)) {
            return preferredSessionId;
          }
          if (current && nextSessions.some((entry) => entry.id === current)) {
            return current;
          }
          return nextSessions[0]?.id || "";
        });
      } catch (error) {
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load surveys"
        });
        setQuestionBank([]);
        setSessions([]);
        setSelectedSessionId("");
      } finally {
        setLoadingSessions(false);
      }
    },
    []
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoadingCompanies(true);

    void (async () => {
      try {
        const res = await fetch("/api/admin/screening-survey-companies", {
          cache: "no-store"
        });
        const payload = (await res.json()) as { companies?: AdminSurveyCompany[]; error?: string };
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load companies");
        }
        if (cancelled) return;

        const records = Array.isArray(payload.companies) ? payload.companies : [];
        setCompanies(records);
        const defaultCompany = records.find((entry) => entry.isScreeningStage) || records[0] || null;
        setSelectedCompanyId(defaultCompany?.id || "");
      } catch (error) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load companies"
        });
      } finally {
        if (!cancelled) {
          setLoadingCompanies(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!selectedCompanyId) return;
    void loadSessions(selectedCompanyId);
  }, [selectedCompanyId, loadSessions]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedSessionId) {
      setSessionDraft(null);
      setResults(null);
      return;
    }
    const nextSession = sessions.find((entry) => entry.id === selectedSessionId) || null;
    setSessionDraft(nextSession ? toDraft(nextSession) : null);
  }, [selectedSessionId, sessions]);

  React.useEffect(() => {
    if (!selectedCompanyId || !selectedSessionId) {
      setResults(null);
      setLoadingResults(false);
      return;
    }

    let cancelled = false;
    setLoadingResults(true);

    void (async () => {
      try {
        const res = await fetch(
          `/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/${selectedSessionId}/results`,
          { cache: "no-store" }
        );
        const payload = (await res.json()) as SurveyResultsPayload;
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load survey results");
        }
        if (cancelled) return;
        setResults(payload);
      } catch (error) {
        if (cancelled) return;
        setResults(null);
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load survey results"
        });
      } finally {
        if (!cancelled) {
          setLoadingResults(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, selectedSessionId, selectedSession?.updatedAt]);

  async function copySurveyLink(path: string) {
    const fullUrl = origin ? `${origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setStatus({ kind: "ok", text: "Survey link copied." });
    } catch {
      setStatus({ kind: "error", text: "Unable to copy survey link. Copy it manually." });
    }
  }

  async function createSurvey() {
    if (!selectedCompanyId) return;
    const activeQuestionIds = questionBank.filter((entry) => entry.isActive).map((entry) => entry.id);
    if (activeQuestionIds.length === 0) {
      setStatus({ kind: "error", text: "No active questions available. Add a question first." });
      return;
    }

    setCreatingSurvey(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSurveyTitle.trim() || undefined,
          questionIds: activeQuestionIds,
          openNow: false
        })
      });
      const payload = (await res.json()) as { session?: { id: string }; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to create survey");
      }
      setNewSurveyTitle("");
      setStatus({ kind: "ok", text: "Survey created." });
      await loadSessions(selectedCompanyId, payload.session?.id);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create survey"
      });
    } finally {
      setCreatingSurvey(false);
    }
  }

  async function deleteSurvey() {
    if (!selectedCompanyId || !sessionDraft) return;
    const warning =
      sessionDraft.responseCount > 0
        ? "Delete this survey and remove its submitted responses?"
        : "Delete this survey?";
    if (!window.confirm(warning)) return;

    setDeletingSurveyId(sessionDraft.id);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/${sessionDraft.id}`,
        { method: "DELETE" }
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete survey");
      }
      setStatus({ kind: "ok", text: "Survey deleted." });
      await loadSessions(selectedCompanyId);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete survey"
      });
    } finally {
      setDeletingSurveyId(null);
    }
  }

  async function saveSurvey() {
    if (!selectedCompanyId || !sessionDraft) return;
    if (sessionDraft.questions.length === 0) {
      setStatus({ kind: "error", text: "A survey needs at least one question." });
      return;
    }

    setSavingSurvey(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/${sessionDraft.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            questionSetLocked
              ? {
                  title: sessionDraft.title.trim(),
                  status: sessionDraft.status
                }
              : normalizeDraftPayload(sessionDraft)
          )
        }
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to save survey");
      }
      setStatus({ kind: "ok", text: "Survey updated." });
      await loadSessions(selectedCompanyId, sessionDraft.id);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save survey"
      });
    } finally {
      setSavingSurvey(false);
    }
  }

  async function autoSaveSurveyStatus(
    sessionId: string,
    previousStatus: SurveySession["status"],
    nextStatus: SurveySession["status"]
  ) {
    if (!selectedCompanyId || !sessionDraft) return;
    if (previousStatus === nextStatus) return;

    setSavingStatus(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/${sessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus })
        }
      );
      const payload = (await res.json()) as { session?: SurveySession; error?: string };
      if (!res.ok || !payload.session) {
        throw new Error(payload.error || "Failed to update survey status");
      }

      const updatedSession = payload.session;
      setSessions((current) =>
        current.map((entry) => {
          if (entry.id === updatedSession.id) {
            return updatedSession;
          }
          if (updatedSession.status === "LIVE" && entry.status === "LIVE") {
            return {
              ...entry,
              status: "CLOSED",
              closedAt: updatedSession.updatedAt,
              updatedAt: updatedSession.updatedAt
            };
          }
          return entry;
        })
      );

      setSessionDraft((current) => {
        if (!current || current.id !== sessionId) return current;
        return {
          ...current,
          status: updatedSession.status,
          responseCount: updatedSession.responseCount,
          sharePath: updatedSession.sharePath
        };
      });

      setStatus({ kind: "ok", text: "Survey status updated." });
    } catch (error) {
      setSessionDraft((current) => {
        if (!current || current.id !== sessionId) return current;
        return {
          ...current,
          status: previousStatus
        };
      });
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update survey status"
      });
    } finally {
      setSavingStatus(false);
    }
  }

  function updateDraftQuestion(index: number, next: Partial<SurveyDraftQuestion>) {
    setSessionDraft((current) => {
      if (!current) return current;
      const questions = current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...next } : question
      );
      return {
        ...current,
        questions
      };
    });
  }

  function moveQuestionWithinCategory(category: string, categoryIndex: number, direction: -1 | 1) {
    setSessionDraft((current) => {
      if (!current) return current;
      const indexes = questionIndexesForCategory(current.questions, category);
      const targetCategoryIndex = categoryIndex + direction;
      if (targetCategoryIndex < 0 || targetCategoryIndex >= indexes.length) {
        return current;
      }

      const sourceGlobalIndex = indexes[categoryIndex];
      const targetGlobalIndex = indexes[targetCategoryIndex];
      const questions = [...current.questions];
      const tmp = questions[sourceGlobalIndex];
      questions[sourceGlobalIndex] = questions[targetGlobalIndex];
      questions[targetGlobalIndex] = tmp;

      return {
        ...current,
        questions
      };
    });
  }

  function removeDraftQuestion(index: number) {
    setSessionDraft((current) => {
      if (!current) return current;
      if (current.questions.length <= 1) {
        setStatus({ kind: "error", text: "A survey requires at least one question." });
        return current;
      }
      return {
        ...current,
        questions: current.questions.filter((_, questionIndex) => questionIndex !== index)
      };
    });
  }

  function moveCategory(category: string, direction: -1 | 1) {
    setSessionDraft((current) => {
      if (!current) return current;
      const currentOrder = orderedCategories(current.questions);
      const currentIndex = currentOrder.indexOf(category);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentOrder.length) return current;

      const nextOrder = [...currentOrder];
      const temp = nextOrder[currentIndex];
      nextOrder[currentIndex] = nextOrder[targetIndex];
      nextOrder[targetIndex] = temp;

      const grouped = new Map<string, SurveyDraftQuestion[]>();
      for (const question of current.questions) {
        const key = normalizeCategory(question.category);
        const existing = grouped.get(key) || [];
        existing.push({ ...question, category: key });
        grouped.set(key, existing);
      }

      return {
        ...current,
        questions: nextOrder.flatMap((entry) => grouped.get(entry) || [])
      };
    });
  }

  function addExistingQuestionToCategory(category: string) {
    if (!sessionDraft) return;
    const selectedQuestionId = addExistingQuestionByCategory[category] || "";
    if (!selectedQuestionId) return;

    const question = questionBank.find((entry) => entry.id === selectedQuestionId);
    if (!question) return;

    if (sessionDraft.questions.some((entry) => entry.questionId === question.id)) {
      setStatus({ kind: "error", text: "Question already exists in this survey." });
      return;
    }

    setSessionDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: insertQuestionIntoCategory(current.questions, category, {
          questionId: question.id,
          category: normalizeCategory(category),
          prompt: question.prompt,
          instructions: normalizeOptionalText(question.instructions),
          scaleMin: question.scaleMin,
          scaleMax: question.scaleMax
        })
      };
    });

    setAddExistingQuestionByCategory((current) => ({
      ...current,
      [category]: ""
    }));
  }

  async function createAndAddQuestionInCategory(category: string) {
    if (!selectedCompanyId || !sessionDraft) return;

    const prompt = (newQuestionPromptByCategory[category] || "").trim();
    const instructions = (newQuestionInstructionsByCategory[category] || "").trim();

    if (!prompt) {
      setStatus({ kind: "error", text: "Provide question text before creating it." });
      return;
    }

    setAddingQuestionByCategory((current) => ({ ...current, [category]: true }));
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: normalizeCategory(category),
          prompt,
          instructions: instructions || undefined,
          scaleMin: 1,
          scaleMax: 10
        })
      });
      const payload = (await res.json()) as { question?: SurveyQuestionBankItem; error?: string };
      if (!res.ok || !payload.question) {
        throw new Error(payload.error || "Failed to create question");
      }
      const createdQuestion = payload.question;

      setQuestionBank((current) => {
        const alreadyExists = current.some((entry) => entry.id === createdQuestion.id);
        if (alreadyExists) return current;
        return [...current, createdQuestion];
      });

      setSessionDraft((current) => {
        if (!current) return current;
        if (current.questions.some((entry) => entry.questionId === createdQuestion.id)) {
          return current;
        }

        return {
          ...current,
          questions: insertQuestionIntoCategory(current.questions, category, {
            questionId: createdQuestion.id,
            category: normalizeCategory(category),
            prompt: createdQuestion.prompt,
            instructions: normalizeOptionalText(createdQuestion.instructions),
            scaleMin: createdQuestion.scaleMin,
            scaleMax: createdQuestion.scaleMax
          })
        };
      });

      setNewQuestionPromptByCategory((current) => ({ ...current, [category]: "" }));
      setNewQuestionInstructionsByCategory((current) => ({ ...current, [category]: "" }));
      setStatus({ kind: "ok", text: "Question created and added to this category." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create question"
      });
    } finally {
      setAddingQuestionByCategory((current) => ({ ...current, [category]: false }));
    }
  }

  const categoryOrder = sessionDraft ? orderedCategories(sessionDraft.questions) : [];
  const resultsSubmissionCount = results?.submissions.length || 0;

  return (
    <>
      <h2>Survey Management</h2>
      <p className="muted">
        Create, edit, and launch webinar surveys. Questions are organized by category and include participant-facing
        instructions.
      </p>
      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

      <div className="grid admin-survey-layout">
        <section className="panel" aria-label="Survey list panel">
          <div className="pipeline-card-head">
            <strong>Surveys</strong>
            <button
              className="ghost small"
              type="button"
              onClick={() => {
                if (selectedCompanyId) void loadSessions(selectedCompanyId);
              }}
              disabled={loadingSessions || !selectedCompanyId}
            >
              Refresh
            </button>
          </div>

          <label htmlFor="admin-survey-company-select">Company</label>
          <select
            id="admin-survey-company-select"
            value={selectedCompanyId}
            onChange={(event) => {
              setSelectedCompanyId(event.target.value);
              setSelectedSessionId("");
            }}
            disabled={loadingCompanies}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <p className="muted">{selectedCompany?.phaseLabel || "No company selected"}</p>

          <label htmlFor="admin-new-survey-title">New survey title</label>
          <input
            id="admin-new-survey-title"
            value={newSurveyTitle}
            onChange={(event) => setNewSurveyTitle(event.target.value)}
            placeholder="e.g. Screening Webinar Survey (March)"
            disabled={!selectedCompanyId}
          />
          <div className="actions">
            <button
              className="secondary"
              type="button"
              onClick={() => void createSurvey()}
              disabled={creatingSurvey || !selectedCompanyId}
            >
              {creatingSurvey ? "Creating..." : "Add Survey"}
            </button>
          </div>

          {!selectedCompany?.isScreeningStage && selectedCompany ? (
            <p className="muted">This company is outside Screening, but surveys can still be prepared.</p>
          ) : null}

          {loadingSessions ? <p className="muted">Loading surveys...</p> : null}
          {!loadingSessions && sessions.length === 0 ? (
            <p className="muted">No surveys yet for this company.</p>
          ) : null}

          <div className="list-container">
            {sessions.map((session) => {
              const active = selectedSessionId === session.id;
              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  className={`list-row ${active ? "active" : ""}`}
                  onClick={() => setSelectedSessionId(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSessionId(session.id);
                    }
                  }}
                >
                  <div className="list-row-main">
                    <strong>{session.title}</strong>
                    <span className="muted">
                      {sessionStatusLabel(session.status)} • {session.responseCount} responses
                    </span>
                  </div>
                  <div className="list-row-meta">
                    <span
                      className={`status-pill ${
                        session.status === "LIVE" ? "running" : session.status === "CLOSED" ? "done" : "draft"
                      }`}
                    >
                      {sessionStatusLabel(session.status)}
                    </span>
                    <span className="muted">{formatDate(session.updatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel" aria-label="Survey detail panel">
          {!sessionDraft ? (
            <p className="muted">Select a survey to edit categories, questions, and results.</p>
          ) : (
            <div className="detail-card">
              <div className="detail-head">
                <h3>{sessionDraft.title}</h3>
              </div>

              <div className="actions" style={{ marginTop: 0 }}>
                <a className="secondary small" href={sessionDraft.sharePath} target="_blank" rel="noreferrer">
                  Open Survey
                </a>
                <button className="ghost small" type="button" onClick={() => void copySurveyLink(sessionDraft.sharePath)}>
                  Copy Link
                </button>
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => void deleteSurvey()}
                  disabled={deletingSurveyId === sessionDraft.id}
                >
                  {deletingSurveyId === sessionDraft.id ? "Deleting..." : "Delete Survey"}
                </button>
              </div>

              <div className="detail-grid">
                <div>
                  <label htmlFor="admin-edit-survey-company">Company</label>
                  <select
                    id="admin-edit-survey-company"
                    value={selectedCompanyId}
                    onChange={(event) => {
                      setSelectedCompanyId(event.target.value);
                      setSelectedSessionId("");
                    }}
                    disabled={loadingCompanies}
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Pipeline Stage</label>
                  <input value={selectedCompany?.phaseLabel || "Not set"} readOnly />
                </div>
                <div>
                  <label htmlFor="admin-edit-survey-title">Survey title</label>
                  <input
                    id="admin-edit-survey-title"
                    value={sessionDraft.title}
                    onChange={(event) =>
                      setSessionDraft((current) =>
                        current
                          ? {
                              ...current,
                              title: event.target.value
                            }
                          : current
                      )
                    }
                  />
                </div>
                <div>
                  <label htmlFor="admin-edit-survey-status">Status</label>
                  <select
                    id="admin-edit-survey-status"
                    value={sessionDraft.status}
                    onChange={(event) => {
                      const previousStatus = sessionDraft.status;
                      const nextStatus = event.target.value as SurveySession["status"];
                      setSessionDraft((current) =>
                        current
                          ? {
                              ...current,
                              status: nextStatus
                            }
                          : current
                      );
                      void autoSaveSurveyStatus(sessionDraft.id, previousStatus, nextStatus);
                    }}
                    disabled={savingStatus || savingSurvey}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="LIVE">Live</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
              </div>

              <p className="muted">
                Responses: {sessionDraft.responseCount} • Question count: {sessionDraft.questions.length}
              </p>
              {questionSetLocked ? (
                <p className="muted">Questions are locked because responses were submitted for this survey.</p>
              ) : null}

              <p className="detail-label">Question Categories</p>
              <div className="admin-survey-category-stack">
                {categoryOrder.map((category, categoryOrderIndex) => {
                  const questionIndexes = questionIndexesForCategory(sessionDraft.questions, category);
                  const existingQuestionValue = addExistingQuestionByCategory[category] || "";
                  const newQuestionPrompt = newQuestionPromptByCategory[category] || "";
                  const newQuestionInstructions = newQuestionInstructionsByCategory[category] || "";
                  const addingQuestion = addingQuestionByCategory[category] || false;
                  return (
                    <section key={category} className="admin-survey-category-panel">
                      <div className="pipeline-card-head">
                        <strong>{category}</strong>
                        <div className="actions" style={{ marginTop: 0 }}>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => moveCategory(category, -1)}
                            disabled={categoryOrderIndex === 0 || questionSetLocked}
                          >
                            Move up
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => moveCategory(category, 1)}
                            disabled={categoryOrderIndex === categoryOrder.length - 1 || questionSetLocked}
                          >
                            Move down
                          </button>
                        </div>
                      </div>

                      <div className="admin-survey-question-list">
                        {questionIndexes.map((globalQuestionIndex, questionIndexWithinCategory) => {
                          const question = sessionDraft.questions[globalQuestionIndex];
                          return (
                            <div key={`${question.questionId}-${globalQuestionIndex}`} className="admin-survey-question-row">
                              <p className="admin-survey-question-order">{questionIndexWithinCategory + 1}</p>
                              <div className="admin-survey-question-fields">
                                <label>Question ({question.scaleMin}-{question.scaleMax})</label>
                                <input
                                  value={question.prompt}
                                  onChange={(event) =>
                                    updateDraftQuestion(globalQuestionIndex, { prompt: event.target.value })
                                  }
                                  disabled={questionSetLocked}
                                />
                                <label>Instructions (shown to participants)</label>
                                <textarea
                                  value={question.instructions || ""}
                                  onChange={(event) =>
                                    updateDraftQuestion(globalQuestionIndex, {
                                      instructions: event.target.value
                                    })
                                  }
                                  rows={2}
                                  disabled={questionSetLocked}
                                />
                                <div className="actions">
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() =>
                                      moveQuestionWithinCategory(
                                        category,
                                        questionIndexWithinCategory,
                                        -1
                                      )
                                    }
                                    disabled={questionIndexWithinCategory === 0 || questionSetLocked}
                                  >
                                    Up
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() =>
                                      moveQuestionWithinCategory(
                                        category,
                                        questionIndexWithinCategory,
                                        1
                                      )
                                    }
                                    disabled={
                                      questionIndexWithinCategory === questionIndexes.length - 1 || questionSetLocked
                                    }
                                  >
                                    Down
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => removeDraftQuestion(globalQuestionIndex)}
                                    disabled={questionSetLocked}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="detail-grid admin-survey-category-builder">
                        <div>
                          <label htmlFor={`admin-category-existing-${category}`}>Add existing question</label>
                          <select
                            id={`admin-category-existing-${category}`}
                            value={existingQuestionValue}
                            onChange={(event) =>
                              setAddExistingQuestionByCategory((current) => ({
                                ...current,
                                [category]: event.target.value
                              }))
                            }
                            disabled={questionSetLocked}
                          >
                            <option value="">Select question</option>
                            {questionBank
                              .filter((entry) => entry.isActive)
                              .map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                  {`${entry.category}: ${entry.prompt}`}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => addExistingQuestionToCategory(category)}
                            disabled={questionSetLocked || !existingQuestionValue}
                          >
                            Add to {category}
                          </button>
                        </div>
                      </div>

                      <div className="detail-grid admin-survey-category-builder">
                        <div>
                          <label htmlFor={`admin-category-new-prompt-${category}`}>Create new question</label>
                          <input
                            id={`admin-category-new-prompt-${category}`}
                            value={newQuestionPrompt}
                            onChange={(event) =>
                              setNewQuestionPromptByCategory((current) => ({
                                ...current,
                                [category]: event.target.value
                              }))
                            }
                            placeholder="Question prompt"
                            disabled={questionSetLocked}
                          />
                        </div>
                        <div>
                          <label htmlFor={`admin-category-new-instructions-${category}`}>Instructions</label>
                          <textarea
                            id={`admin-category-new-instructions-${category}`}
                            value={newQuestionInstructions}
                            onChange={(event) =>
                              setNewQuestionInstructionsByCategory((current) => ({
                                ...current,
                                [category]: event.target.value
                              }))
                            }
                            rows={2}
                            placeholder="Optional instructions shown below the question"
                            disabled={questionSetLocked}
                          />
                        </div>
                        <div className="actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => void createAndAddQuestionInCategory(category)}
                            disabled={questionSetLocked || addingQuestion}
                          >
                            {addingQuestion ? "Adding..." : `Create in ${category}`}
                          </button>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="actions">
                {isDirty ? <span className="muted">Unsaved changes</span> : <span className="muted">Saved</span>}
                <button
                  className="primary"
                  type="button"
                  onClick={() => void saveSurvey()}
                  disabled={!isDirty || savingSurvey || savingStatus}
                >
                  {savingSurvey ? "Saving..." : "Save Survey Changes"}
                </button>
              </div>

              <div className="detail-section">
                <div className="pipeline-card-head">
                  <strong>Survey Results</strong>
                  <span className="status-pill queued">{`${resultsSubmissionCount} responses`}</span>
                </div>
                {loadingResults ? <p className="muted">Loading results...</p> : null}
                {!loadingResults && (!results || results.submissions.length === 0) ? (
                  <p className="muted">No responses captured yet.</p>
                ) : null}
                {!loadingResults && results && results.submissions.length > 0 ? (
                  <>
                    <div className="admin-survey-results-grid">
                      <section>
                        <p className="detail-label">Category averages</p>
                        <div className="list-container">
                          {results.categoryAverages.map((entry) => (
                            <div key={entry.category} className="list-row">
                              <div className="list-row-main">
                                <strong>{entry.category}</strong>
                                <span className="muted">{entry.responseCount} scored answers</span>
                              </div>
                              <div className="list-row-meta">
                                <span className="status-pill running">
                                  {entry.averageScore === null ? "N/A" : entry.averageScore.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <p className="detail-label">Question averages</p>
                        <div className="list-container">
                          {results.questionAverages.map((entry) => (
                            <div key={entry.sessionQuestionId} className="list-row">
                              <div className="list-row-main">
                                <strong>{entry.prompt}</strong>
                                <span className="muted">{entry.responseCount} responses • {entry.category}</span>
                                {entry.instructions ? <span className="muted">{entry.instructions}</span> : null}
                              </div>
                              <div className="list-row-meta">
                                <span className="status-pill running">
                                  {entry.averageScore === null ? "N/A" : entry.averageScore.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>

                    <p className="detail-label">Submissions</p>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Submitted</th>
                            <th>Participant</th>
                            <th>Contact</th>
                            <th>Health System</th>
                            <th>Average</th>
                            <th>Answers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.submissions.map((entry) => (
                            <tr key={entry.submissionId}>
                              <td>{formatDate(entry.submittedAt)}</td>
                              <td>
                                <strong>{entry.participantName}</strong>
                                <div className="muted">{entry.participantEmail || "No email"}</div>
                              </td>
                              <td>
                                {entry.contactName ? (
                                  <>
                                    <strong>{entry.contactName}</strong>
                                    <div className="muted">{entry.contactTitle || "Contact linked"}</div>
                                  </>
                                ) : (
                                  <span className="muted">Unlinked</span>
                                )}
                              </td>
                              <td>{entry.healthSystemName}</td>
                              <td>{entry.averageScore === null ? "N/A" : entry.averageScore.toFixed(1)}</td>
                              <td>
                                <details>
                                  <summary>{`${entry.answerCount} scores`}</summary>
                                  <div className="admin-survey-submission-answers">
                                    {entry.answers.map((answer) => (
                                      <p key={answer.answerId}>
                                        <strong>{answer.category}:</strong> {answer.prompt} = {answer.score}
                                      </p>
                                    ))}
                                  </div>
                                </details>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
