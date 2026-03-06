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
  isStandard?: boolean;
};

type SurveySessionQuestion = {
  sessionQuestionId: string;
  questionId: string;
  templateQuestionId?: string | null;
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
  templateId?: string | null;
  templateKey?: string | null;
  templateName?: string | null;
  templateIsStandard?: boolean;
  questions: SurveySessionQuestion[];
};

type SurveyTemplateQuestion = {
  templateQuestionId: string;
  questionId: string;
  displayOrder: number;
  category: string;
  prompt: string;
  instructions: string | null;
  scaleMin: number;
  scaleMax: number;
};

type SurveyTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isStandard: boolean;
  questionCount: number;
  usageCount: number;
  lastUsedAt: string | null;
  questions: SurveyTemplateQuestion[];
};

type SurveyCopySourceSession = {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  updatedAt: string;
  questionCount: number;
  responseCount: number;
  templateId: string | null;
  templateName: string | null;
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

type SurveyManagementTab = "SURVEYS" | "TEMPLATE_LIBRARY";

type TemplateLibraryDraftQuestion = {
  questionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  scaleMin: number;
  scaleMax: number;
};

type TemplateLibraryDraft = {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
  isStandard: boolean;
  usageCount: number;
  questions: TemplateLibraryDraftQuestion[];
};

type AddQuestionModalState = {
  context: "SURVEY" | "TEMPLATE";
  category: string;
};

type SurveyDataPayload = {
  questionBank: SurveyQuestionBankItem[];
  surveyTemplates?: SurveyTemplate[];
  surveyTemplatesAll?: SurveyTemplate[];
  sessions: SurveySession[];
  sourceSessions?: SurveyCopySourceSession[];
  error?: string;
};

type SurveyResultsAnswer = {
  answerId: string;
  sessionQuestionId: string;
  questionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  score: number | null;
  isSkipped: boolean;
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
  skippedAnswerCount: number;
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
  return trimmed ? trimmed : "";
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

function toTemplateLibraryDraft(template: SurveyTemplate): TemplateLibraryDraft {
  return {
    id: template.id,
    name: template.name,
    description: template.description || "",
    isActive: template.isActive,
    isStandard: template.isStandard,
    usageCount: template.usageCount,
    questions: [...template.questions]
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

function normalizeTemplateDraftPayload(draft: TemplateLibraryDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    isActive: draft.isActive,
    questions: draft.questions.map((entry, index) => ({
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
  const [activeTab, setActiveTab] = React.useState<SurveyManagementTab>("SURVEYS");
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [companies, setCompanies] = React.useState<AdminSurveyCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = React.useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState("");
  const [questionBank, setQuestionBank] = React.useState<SurveyQuestionBankItem[]>([]);
  const [surveyTemplates, setSurveyTemplates] = React.useState<SurveyTemplate[]>([]);
  const [libraryTemplates, setLibraryTemplates] = React.useState<SurveyTemplate[]>([]);
  const [sessions, setSessions] = React.useState<SurveySession[]>([]);
  const [sourceSessions, setSourceSessions] = React.useState<SurveyCopySourceSession[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(false);
  const [selectedSessionId, setSelectedSessionId] = React.useState("");
  const [sessionDraft, setSessionDraft] = React.useState<SurveySessionDraft | null>(null);
  const [newSurveyTitle, setNewSurveyTitle] = React.useState("");
  const [newSurveySourceMode, setNewSurveySourceMode] = React.useState<"TEMPLATE" | "SESSION" | "QUESTIONS">(
    "TEMPLATE"
  );
  const [newSurveyTemplateId, setNewSurveyTemplateId] = React.useState("");
  const [newSurveySourceSessionId, setNewSurveySourceSessionId] = React.useState("");
  const [showAddSurveyModal, setShowAddSurveyModal] = React.useState(false);
  const [creatingSurvey, setCreatingSurvey] = React.useState(false);
  const [savingSurvey, setSavingSurvey] = React.useState(false);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [deletingSurveyId, setDeletingSurveyId] = React.useState<string | null>(null);
  const [libraryTemplateId, setLibraryTemplateId] = React.useState("");
  const [libraryTemplateName, setLibraryTemplateName] = React.useState("");
  const [libraryTemplateDescription, setLibraryTemplateDescription] = React.useState("");
  const [showAddLibraryTemplateModal, setShowAddLibraryTemplateModal] = React.useState(false);
  const [newLibraryTemplateName, setNewLibraryTemplateName] = React.useState("");
  const [newLibraryTemplateDescription, setNewLibraryTemplateDescription] = React.useState("");
  const [savingTemplateMode, setSavingTemplateMode] = React.useState<"CREATE" | "UPDATE" | null>(null);
  const [updatingLibraryTemplateId, setUpdatingLibraryTemplateId] = React.useState<string | null>(null);
  const [deletingLibraryTemplateId, setDeletingLibraryTemplateId] = React.useState<string | null>(null);
  const [selectedTemplateLibraryId, setSelectedTemplateLibraryId] = React.useState("");
  const [templateLibraryDraft, setTemplateLibraryDraft] = React.useState<TemplateLibraryDraft | null>(null);
  const [addQuestionModal, setAddQuestionModal] = React.useState<AddQuestionModalState | null>(null);
  const [modalExistingQuestionId, setModalExistingQuestionId] = React.useState("");
  const [modalNewQuestionPrompt, setModalNewQuestionPrompt] = React.useState("");
  const [modalNewQuestionInstructions, setModalNewQuestionInstructions] = React.useState("");
  const [submittingAddQuestionModal, setSubmittingAddQuestionModal] = React.useState(false);
  const [templateNewCategoryName, setTemplateNewCategoryName] = React.useState("");
  const [templateNewCategoryPrompt, setTemplateNewCategoryPrompt] = React.useState("");
  const [templateNewCategoryInstructions, setTemplateNewCategoryInstructions] = React.useState("");
  const [addingTemplateCategory, setAddingTemplateCategory] = React.useState(false);
  const [savingTemplateLibraryDraft, setSavingTemplateLibraryDraft] = React.useState(false);
  const [deletingTemplateLibraryDraftId, setDeletingTemplateLibraryDraftId] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [loadingResults, setLoadingResults] = React.useState(false);
  const [results, setResults] = React.useState<SurveyResultsPayload | null>(null);

  const selectedCompany = companies.find((entry) => entry.id === selectedCompanyId) || null;
  const selectedSession = sessions.find((entry) => entry.id === selectedSessionId) || null;
  const selectedLibraryTemplate = libraryTemplates.find((entry) => entry.id === libraryTemplateId) || null;
  const selectedTemplateLibrary =
    libraryTemplates.find((entry) => entry.id === selectedTemplateLibraryId) || null;
  const hasResponses = (sessionDraft?.responseCount || 0) > 0;
  const questionEditingLocked = sessionDraft?.status === "LIVE";
  const libraryTemplateActionLocked =
    savingTemplateMode !== null || updatingLibraryTemplateId !== null || deletingLibraryTemplateId !== null;
  const templateLibraryActionLocked =
    savingTemplateLibraryDraft ||
    deletingTemplateLibraryDraftId !== null ||
    addingTemplateCategory ||
    submittingAddQuestionModal ||
    updatingLibraryTemplateId !== null ||
    deletingLibraryTemplateId !== null;
  const addQuestionModalLocked =
    addQuestionModal?.context === "SURVEY" ? questionEditingLocked || !sessionDraft : !templateLibraryDraft;
  const modalAvailableQuestions = React.useMemo(() => {
    if (!addQuestionModal) return [];
    const usedQuestionIds = new Set(
      (addQuestionModal.context === "SURVEY"
        ? sessionDraft?.questions.map((entry) => entry.questionId)
        : templateLibraryDraft?.questions.map((entry) => entry.questionId)) || []
    );
    return questionBank.filter((entry) => entry.isActive && !usedQuestionIds.has(entry.id));
  }, [addQuestionModal, questionBank, sessionDraft?.questions, templateLibraryDraft?.questions]);

  const removedQuestionCount = React.useMemo(() => {
    if (!selectedSession || !sessionDraft) return 0;
    const savedQuestionIds = new Set(selectedSession.questions.map((entry) => entry.questionId));
    const draftQuestionIds = new Set(sessionDraft.questions.map((entry) => entry.questionId));
    let removed = 0;
    for (const questionId of savedQuestionIds) {
      if (!draftQuestionIds.has(questionId)) {
        removed += 1;
      }
    }
    return removed;
  }, [selectedSession, sessionDraft]);

  const isDirty = React.useMemo(() => {
    if (!selectedSession || !sessionDraft) return false;
    return (
      JSON.stringify(normalizeDraftPayload(sessionDraft)) !==
      JSON.stringify(normalizeSessionPayload(selectedSession))
    );
  }, [selectedSession, sessionDraft]);

  React.useEffect(() => {
    if (!addQuestionModal) {
      setModalExistingQuestionId("");
      return;
    }
    if (modalAvailableQuestions.length === 0) {
      setModalExistingQuestionId("");
      return;
    }
    setModalExistingQuestionId((current) =>
      current && modalAvailableQuestions.some((entry) => entry.id === current)
        ? current
        : modalAvailableQuestions[0].id
    );
  }, [addQuestionModal, modalAvailableQuestions]);

  const loadSessions = React.useCallback(
    async (companyId: string, preferredSessionId?: string) => {
      if (!companyId) {
        setQuestionBank([]);
        setSurveyTemplates([]);
        setLibraryTemplates([]);
        setSessions([]);
        setSourceSessions([]);
        setSelectedSessionId("");
        setLibraryTemplateId("");
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
        const nextTemplates = Array.isArray(payload.surveyTemplates) ? payload.surveyTemplates : [];
        const nextLibraryTemplates = Array.isArray(payload.surveyTemplatesAll)
          ? payload.surveyTemplatesAll
          : nextTemplates;
        const nextSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        const nextSourceSessions = Array.isArray(payload.sourceSessions) ? payload.sourceSessions : [];
        setQuestionBank(nextQuestionBank);
        setSurveyTemplates(nextTemplates);
        setLibraryTemplates(nextLibraryTemplates);
        setSessions(nextSessions);
        setSourceSessions(nextSourceSessions);
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
        setSurveyTemplates([]);
        setLibraryTemplates([]);
        setSessions([]);
        setSourceSessions([]);
        setSelectedSessionId("");
        setLibraryTemplateId("");
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
    if (surveyTemplates.length === 0) {
      setNewSurveyTemplateId("");
      return;
    }
    setNewSurveyTemplateId((current) => {
      if (current && surveyTemplates.some((entry) => entry.id === current)) {
        return current;
      }
      return surveyTemplates.find((entry) => entry.isStandard)?.id || surveyTemplates[0].id;
    });
  }, [surveyTemplates]);

  React.useEffect(() => {
    if (sourceSessions.length === 0) {
      setNewSurveySourceSessionId("");
      return;
    }
    setNewSurveySourceSessionId((current) => {
      if (current && sourceSessions.some((entry) => entry.id === current)) {
        return current;
      }
      return sourceSessions[0].id;
    });
  }, [sourceSessions]);

  React.useEffect(() => {
    if (libraryTemplates.length === 0) {
      setLibraryTemplateId("");
      setLibraryTemplateName("");
      setLibraryTemplateDescription("");
      return;
    }
    setLibraryTemplateId((current) => {
      if (current && libraryTemplates.some((entry) => entry.id === current)) {
        return current;
      }
      if (
        selectedSession?.templateId &&
        libraryTemplates.some((entry) => entry.id === selectedSession.templateId)
      ) {
        return selectedSession.templateId;
      }
      return libraryTemplates.find((entry) => entry.isStandard)?.id || libraryTemplates[0].id;
    });
  }, [libraryTemplates, selectedSession?.templateId]);

  React.useEffect(() => {
    if (!libraryTemplateId) {
      return;
    }
    const template = libraryTemplates.find((entry) => entry.id === libraryTemplateId);
    if (!template) {
      return;
    }
    setLibraryTemplateName(template.name);
    setLibraryTemplateDescription(template.description || "");
  }, [libraryTemplateId, libraryTemplates]);

  React.useEffect(() => {
    if (libraryTemplates.length === 0) {
      setSelectedTemplateLibraryId("");
      setTemplateLibraryDraft(null);
      return;
    }
    setSelectedTemplateLibraryId((current) => {
      if (current && libraryTemplates.some((entry) => entry.id === current)) {
        return current;
      }
      return libraryTemplates.find((entry) => entry.isStandard)?.id || libraryTemplates[0].id;
    });
  }, [libraryTemplates]);

  React.useEffect(() => {
    if (!selectedTemplateLibraryId) {
      setTemplateLibraryDraft((current) => {
        if (current && current.id === null) {
          return current;
        }
        return null;
      });
      return;
    }
    const template = libraryTemplates.find((entry) => entry.id === selectedTemplateLibraryId) || null;
    setTemplateLibraryDraft(template ? toTemplateLibraryDraft(template) : null);
  }, [selectedTemplateLibraryId, libraryTemplates]);

  React.useEffect(() => {
    setTemplateNewCategoryName("");
    setTemplateNewCategoryPrompt("");
    setTemplateNewCategoryInstructions("");
  }, [selectedTemplateLibraryId]);

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

  function openAddSurveyModal() {
    if (!selectedCompanyId) {
      setStatus({ kind: "error", text: "Select a company first." });
      return;
    }
    setShowAddSurveyModal(true);
  }

  function closeAddSurveyModal() {
    if (creatingSurvey) return;
    setShowAddSurveyModal(false);
  }

  async function createSurvey() {
    if (!selectedCompanyId) return;

    let requestPayload: Record<string, unknown> = {
      title: newSurveyTitle.trim() || undefined,
      openNow: false
    };

    if (newSurveySourceMode === "TEMPLATE") {
      const templateId = newSurveyTemplateId || surveyTemplates.find((entry) => entry.isStandard)?.id || "";
      if (!templateId) {
        setStatus({ kind: "error", text: "Select a survey template." });
        return;
      }
      requestPayload = {
        ...requestPayload,
        templateId
      };
    } else if (newSurveySourceMode === "SESSION") {
      const sourceSessionId = newSurveySourceSessionId || sourceSessions[0]?.id || "";
      if (!sourceSessionId) {
        setStatus({ kind: "error", text: "Select an existing survey to copy." });
        return;
      }
      requestPayload = {
        ...requestPayload,
        sourceSessionId
      };
    } else {
      const activeQuestionIds = questionBank.filter((entry) => entry.isActive).map((entry) => entry.id);
      if (activeQuestionIds.length === 0) {
        setStatus({ kind: "error", text: "No active questions available. Add a question first." });
        return;
      }
      requestPayload = {
        ...requestPayload,
        questionIds: activeQuestionIds
      };
    }

    setCreatingSurvey(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const responsePayload = (await res.json()) as { session?: { id: string }; error?: string };
      if (!res.ok) {
        throw new Error(responsePayload.error || "Failed to create survey");
      }
      setNewSurveyTitle("");
      setShowAddSurveyModal(false);
      setStatus({ kind: "ok", text: "Survey created." });
      await loadSessions(selectedCompanyId, responsePayload.session?.id);
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
    const normalizedDraft = normalizeDraftPayload(sessionDraft);
    const existingQuestions =
      selectedSession?.questions
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((entry, index) => ({
          questionId: entry.questionId,
          category: normalizeCategory(entry.category),
          prompt: entry.prompt.trim() || "Untitled question",
          instructions: normalizeOptionalText(entry.instructions),
          displayOrder: index
        })) || [];
    const questionSetChanged = JSON.stringify(normalizedDraft.questions) !== JSON.stringify(existingQuestions);

    if (sessionDraft.status === "LIVE" && questionSetChanged) {
      setStatus({ kind: "error", text: "Set the survey to Draft before editing questions." });
      return;
    }
    if (hasResponses && removedQuestionCount > 0) {
      const confirmed = window.confirm(
        `This removes ${removedQuestionCount} question${removedQuestionCount === 1 ? "" : "s"} from the survey. ` +
          "Responses for removed questions will be deleted. Responses for retained questions will be kept. Continue?"
      );
      if (!confirmed) {
        return;
      }
    }

    setSavingSurvey(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/${sessionDraft.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizedDraft)
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

  function openAddLibraryTemplateModal() {
    if (!sessionDraft) {
      setStatus({ kind: "error", text: "Select a survey first." });
      return;
    }
    if (sessionDraft.questions.length === 0) {
      setStatus({ kind: "error", text: "A template requires at least one question." });
      return;
    }
    setNewLibraryTemplateName(sessionDraft.title.trim());
    setNewLibraryTemplateDescription("");
    setShowAddLibraryTemplateModal(true);
  }

  function closeAddLibraryTemplateModal() {
    if (savingTemplateMode === "CREATE") return;
    setShowAddLibraryTemplateModal(false);
    setNewLibraryTemplateName("");
    setNewLibraryTemplateDescription("");
  }

  async function saveTemplateFromCurrentSurvey(
    mode: "CREATE" | "UPDATE",
    overrides?: { name?: string; description?: string }
  ) {
    if (!selectedCompanyId || !sessionDraft) return;
    if (sessionDraft.questions.length === 0) {
      setStatus({ kind: "error", text: "A template requires at least one question." });
      return false;
    }

    const nameValue = overrides?.name ?? libraryTemplateName;
    const descriptionValue = overrides?.description ?? libraryTemplateDescription;
    const trimmedName = nameValue.trim();
    if (!trimmedName) {
      setStatus({ kind: "error", text: "Template name is required." });
      return false;
    }

    if (mode === "UPDATE" && !libraryTemplateId) {
      setStatus({ kind: "error", text: "Select a template to update." });
      return false;
    }

    if (mode === "UPDATE" && selectedLibraryTemplate?.isStandard) {
      const confirmed = window.confirm(
        "Update this standard template for all future surveys created from it?"
      );
      if (!confirmed) {
        return false;
      }
    }

    const questions = sessionDraft.questions.map((entry, index) => ({
      questionId: entry.questionId,
      category: normalizeCategory(entry.category),
      prompt: entry.prompt.trim() || "Untitled question",
      instructions: normalizeOptionalText(entry.instructions),
      displayOrder: index
    }));

    setSavingTemplateMode(mode);
    setStatus(null);
    try {
      const endpoint =
        mode === "CREATE"
          ? "/api/admin/screening-survey-library"
          : `/api/admin/screening-survey-library/${libraryTemplateId}`;
      const method = mode === "CREATE" ? "POST" : "PATCH";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: descriptionValue.trim() || undefined,
          isActive: true,
          questions
        })
      });
      const payload = (await res.json()) as { template?: SurveyTemplate; error?: string };
      if (!res.ok || !payload.template) {
        throw new Error(payload.error || "Failed to save survey template");
      }

      setLibraryTemplateId(payload.template.id);
      setLibraryTemplateName(payload.template.name);
      setLibraryTemplateDescription(payload.template.description || "");
      if (payload.template.isActive) {
        setNewSurveyTemplateId(payload.template.id);
      }
      setStatus({
        kind: "ok",
        text: mode === "CREATE" ? "Template added to the library." : "Template updated in the library."
      });
      await loadSessions(selectedCompanyId, sessionDraft.id);
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save survey template"
      });
      return false;
    } finally {
      setSavingTemplateMode(null);
    }
  }

  async function saveNewLibraryTemplateFromModal() {
    const created = await saveTemplateFromCurrentSurvey("CREATE", {
      name: newLibraryTemplateName,
      description: newLibraryTemplateDescription
    });
    if (!created) {
      return;
    }
    closeAddLibraryTemplateModal();
  }

  async function toggleLibraryTemplateActive(nextIsActive: boolean) {
    if (!selectedCompanyId || !selectedLibraryTemplate) return;
    if (selectedLibraryTemplate.isStandard && !nextIsActive) {
      setStatus({ kind: "error", text: "Standard templates cannot be deactivated." });
      return;
    }

    if (!nextIsActive && selectedLibraryTemplate.usageCount > 0) {
      const confirmed = window.confirm(
        "Deactivate this template? Existing surveys keep their questions, but new surveys cannot be created from this template."
      );
      if (!confirmed) {
        return;
      }
    }

    setUpdatingLibraryTemplateId(selectedLibraryTemplate.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/screening-survey-library/${selectedLibraryTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextIsActive })
      });
      const payload = (await res.json()) as { template?: SurveyTemplate; error?: string };
      if (!res.ok || !payload.template) {
        throw new Error(payload.error || "Failed to update template status");
      }

      setStatus({
        kind: "ok",
        text: nextIsActive ? "Template activated." : "Template deactivated."
      });
      await loadSessions(selectedCompanyId, selectedSessionId || undefined);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update template status"
      });
    } finally {
      setUpdatingLibraryTemplateId(null);
    }
  }

  async function deleteLibraryTemplate() {
    if (!selectedCompanyId || !selectedLibraryTemplate) return;
    if (selectedLibraryTemplate.isStandard) {
      setStatus({ kind: "error", text: "Standard templates cannot be deleted." });
      return;
    }

    const warning =
      selectedLibraryTemplate.usageCount > 0
        ? `Delete "${selectedLibraryTemplate.name}" from the library? Existing survey sessions keep their questions, but the template reference is removed.`
        : `Delete "${selectedLibraryTemplate.name}" from the library?`;
    if (!window.confirm(warning)) {
      return;
    }

    setDeletingLibraryTemplateId(selectedLibraryTemplate.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/screening-survey-library/${selectedLibraryTemplate.id}`, {
        method: "DELETE"
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete template");
      }
      setStatus({ kind: "ok", text: "Template deleted from the library." });
      await loadSessions(selectedCompanyId, selectedSessionId || undefined);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete template"
      });
    } finally {
      setDeletingLibraryTemplateId(null);
    }
  }

  function beginNewTemplateLibraryDraft() {
    setSelectedTemplateLibraryId("");
    setTemplateNewCategoryName("");
    setTemplateNewCategoryPrompt("");
    setTemplateNewCategoryInstructions("");
    setTemplateLibraryDraft({
      id: null,
      name: "",
      description: "",
      isActive: true,
      isStandard: false,
      usageCount: 0,
      questions: []
    });
  }

  function resetTemplateLibraryDraft() {
    setTemplateNewCategoryName("");
    setTemplateNewCategoryPrompt("");
    setTemplateNewCategoryInstructions("");
    if (!selectedTemplateLibrary) {
      beginNewTemplateLibraryDraft();
      return;
    }
    setTemplateLibraryDraft(toTemplateLibraryDraft(selectedTemplateLibrary));
  }

  function updateTemplateLibraryQuestion(
    index: number,
    next: Partial<TemplateLibraryDraftQuestion>
  ) {
    setTemplateLibraryDraft((current) => {
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

  function moveTemplateLibraryQuestionWithinCategory(
    category: string,
    categoryIndex: number,
    direction: -1 | 1
  ) {
    setTemplateLibraryDraft((current) => {
      if (!current) return current;
      const indexes = questionIndexesForCategory(current.questions, category);
      const targetCategoryIndex = categoryIndex + direction;
      if (targetCategoryIndex < 0 || targetCategoryIndex >= indexes.length) {
        return current;
      }

      const sourceIndex = indexes[categoryIndex];
      const targetIndex = indexes[targetCategoryIndex];
      const questions = [...current.questions];
      const tmp = questions[sourceIndex];
      questions[sourceIndex] = questions[targetIndex];
      questions[targetIndex] = tmp;
      return {
        ...current,
        questions
      };
    });
  }

  function moveTemplateLibraryCategory(category: string, direction: -1 | 1) {
    setTemplateLibraryDraft((current) => {
      if (!current) return current;
      const currentOrder = orderedCategories(current.questions);
      const currentIndex = currentOrder.indexOf(category);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentOrder.length) return current;

      const nextOrder = [...currentOrder];
      const tmp = nextOrder[currentIndex];
      nextOrder[currentIndex] = nextOrder[targetIndex];
      nextOrder[targetIndex] = tmp;

      const grouped = new Map<string, TemplateLibraryDraftQuestion[]>();
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

  function removeTemplateLibraryQuestion(index: number) {
    setTemplateLibraryDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: current.questions.filter((_, questionIndex) => questionIndex !== index)
      };
    });
  }

  function addExistingQuestionToTemplateCategory(category: string, questionId: string) {
    if (!templateLibraryDraft) return false;
    if (!questionId) return false;
    if (templateLibraryDraft.questions.some((entry) => entry.questionId === questionId)) {
      setStatus({ kind: "error", text: "Question already exists in this template." });
      return false;
    }
    const question = questionBank.find((entry) => entry.id === questionId);
    if (!question) {
      setStatus({ kind: "error", text: "Selected question is no longer available." });
      return false;
    }
    setTemplateLibraryDraft((current) => {
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
    return true;
  }

  async function createAndAddQuestionToTemplateCategory(
    category: string,
    promptValue: string,
    instructionsValue: string
  ) {
    if (!selectedCompanyId || !templateLibraryDraft) return false;

    const prompt = promptValue.trim();
    const instructions = instructionsValue.trim();

    if (!prompt) {
      setStatus({ kind: "error", text: "Provide question text before creating it." });
      return false;
    }

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
        const exists = current.some((entry) => entry.id === createdQuestion.id);
        if (exists) return current;
        return [...current, createdQuestion];
      });

      setTemplateLibraryDraft((current) => {
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

      setStatus({ kind: "ok", text: "Question created and added to the template." });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create question"
      });
      return false;
    }
  }

  async function createAndAddNewTemplateCategory() {
    if (!selectedCompanyId || !templateLibraryDraft) return;

    const category = normalizeCategory(templateNewCategoryName);
    const prompt = templateNewCategoryPrompt.trim();
    const instructions = templateNewCategoryInstructions.trim();
    if (!templateNewCategoryName.trim()) {
      setStatus({ kind: "error", text: "Category name is required." });
      return;
    }
    if (!prompt) {
      setStatus({ kind: "error", text: "Provide a first question for the new category." });
      return;
    }
    if (orderedCategories(templateLibraryDraft.questions).includes(category)) {
      setStatus({ kind: "error", text: "Category already exists. Add a question within that category." });
      return;
    }

    setAddingTemplateCategory(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${selectedCompanyId}/screening-surveys/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
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
        const exists = current.some((entry) => entry.id === createdQuestion.id);
        if (exists) return current;
        return [...current, createdQuestion];
      });

      setTemplateLibraryDraft((current) => {
        if (!current) return current;
        if (current.questions.some((entry) => entry.questionId === createdQuestion.id)) {
          return current;
        }
        return {
          ...current,
          questions: insertQuestionIntoCategory(current.questions, category, {
            questionId: createdQuestion.id,
            category,
            prompt: createdQuestion.prompt,
            instructions: normalizeOptionalText(createdQuestion.instructions),
            scaleMin: createdQuestion.scaleMin,
            scaleMax: createdQuestion.scaleMax
          })
        };
      });

      setTemplateNewCategoryName("");
      setTemplateNewCategoryPrompt("");
      setTemplateNewCategoryInstructions("");
      setStatus({ kind: "ok", text: `Category ${category} added with its first question.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add category"
      });
    } finally {
      setAddingTemplateCategory(false);
    }
  }

  async function saveTemplateLibraryDraft() {
    if (!selectedCompanyId || !templateLibraryDraft) return;
    const trimmedName = templateLibraryDraft.name.trim();
    if (!trimmedName) {
      setStatus({ kind: "error", text: "Template name is required." });
      return;
    }
    if (templateLibraryDraft.questions.length === 0) {
      setStatus({ kind: "error", text: "Add at least one question to the template." });
      return;
    }
    if (templateLibraryDraft.isStandard && !templateLibraryDraft.isActive) {
      setStatus({ kind: "error", text: "Standard templates must remain active." });
      return;
    }
    if (templateLibraryDraft.isStandard) {
      const confirmed = window.confirm(
        "Update this standard template for all future surveys created from it?"
      );
      if (!confirmed) {
        return;
      }
    }

    setSavingTemplateLibraryDraft(true);
    setStatus(null);
    try {
      const payload = normalizeTemplateDraftPayload({
        ...templateLibraryDraft,
        name: trimmedName,
        isActive: templateLibraryDraft.isStandard ? true : templateLibraryDraft.isActive
      });
      const isCreate = !templateLibraryDraft.id;
      const endpoint = isCreate
        ? "/api/admin/screening-survey-library"
        : `/api/admin/screening-survey-library/${templateLibraryDraft.id}`;
      const method = isCreate ? "POST" : "PATCH";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const responsePayload = (await res.json()) as { template?: SurveyTemplate; error?: string };
      if (!res.ok || !responsePayload.template) {
        throw new Error(responsePayload.error || "Failed to save template");
      }

      setStatus({ kind: "ok", text: isCreate ? "Template created." : "Template updated." });
      await loadSessions(selectedCompanyId, selectedSessionId || undefined);
      setSelectedTemplateLibraryId(responsePayload.template.id);
      setTemplateLibraryDraft(toTemplateLibraryDraft(responsePayload.template));
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save template"
      });
    } finally {
      setSavingTemplateLibraryDraft(false);
    }
  }

  async function deleteTemplateLibraryDraft() {
    if (!selectedCompanyId || !templateLibraryDraft?.id) return;
    if (templateLibraryDraft.isStandard) {
      setStatus({ kind: "error", text: "Standard templates cannot be deleted." });
      return;
    }
    const warning =
      templateLibraryDraft.usageCount > 0
        ? `Delete "${templateLibraryDraft.name}"? Existing survey sessions keep their questions, but the template reference is removed.`
        : `Delete "${templateLibraryDraft.name}"?`;
    if (!window.confirm(warning)) {
      return;
    }

    setDeletingTemplateLibraryDraftId(templateLibraryDraft.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/screening-survey-library/${templateLibraryDraft.id}`, {
        method: "DELETE"
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete template");
      }
      setStatus({ kind: "ok", text: "Template deleted." });
      await loadSessions(selectedCompanyId, selectedSessionId || undefined);
      setSelectedTemplateLibraryId("");
      setTemplateLibraryDraft(null);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete template"
      });
    } finally {
      setDeletingTemplateLibraryDraftId(null);
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

  function addExistingQuestionToSurveyCategory(category: string, questionId: string) {
    if (!sessionDraft) return false;
    if (!questionId) return false;
    const question = questionBank.find((entry) => entry.id === questionId);
    if (!question) {
      setStatus({ kind: "error", text: "Selected question is no longer available." });
      return false;
    }
    if (sessionDraft.questions.some((entry) => entry.questionId === question.id)) {
      setStatus({ kind: "error", text: "Question already exists in this survey." });
      return false;
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
    return true;
  }

  async function createAndAddQuestionToSurveyCategory(
    category: string,
    promptValue: string,
    instructionsValue: string
  ) {
    if (!selectedCompanyId || !sessionDraft) return false;

    const prompt = promptValue.trim();
    const instructions = instructionsValue.trim();

    if (!prompt) {
      setStatus({ kind: "error", text: "Provide question text before creating it." });
      return false;
    }

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

      setStatus({ kind: "ok", text: "Question created and added to this category." });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create question"
      });
      return false;
    }
  }

  function openAddQuestionModal(context: "SURVEY" | "TEMPLATE", category: string) {
    setAddQuestionModal({ context, category: normalizeCategory(category) });
    setModalNewQuestionPrompt("");
    setModalNewQuestionInstructions("");
  }

  function closeAddQuestionModal() {
    if (submittingAddQuestionModal) return;
    setAddQuestionModal(null);
    setModalExistingQuestionId("");
    setModalNewQuestionPrompt("");
    setModalNewQuestionInstructions("");
  }

  function addExistingQuestionFromModal() {
    if (!addQuestionModal) return;
    if (addQuestionModalLocked) {
      const message =
        addQuestionModal.context === "SURVEY"
          ? "Set this survey to Draft before adding questions."
          : "Select a template before adding questions.";
      setStatus({ kind: "error", text: message });
      return;
    }
    const questionId = modalExistingQuestionId || "";
    if (!questionId) {
      setStatus({ kind: "error", text: "Select an existing question to add." });
      return;
    }
    const added =
      addQuestionModal.context === "SURVEY"
        ? addExistingQuestionToSurveyCategory(addQuestionModal.category, questionId)
        : addExistingQuestionToTemplateCategory(addQuestionModal.category, questionId);
    if (!added) return;
    setStatus({ kind: "ok", text: `Question added to ${addQuestionModal.category}.` });
    closeAddQuestionModal();
  }

  async function createQuestionFromModal() {
    if (!addQuestionModal) return;
    if (addQuestionModalLocked) {
      const message =
        addQuestionModal.context === "SURVEY"
          ? "Set this survey to Draft before adding questions."
          : "Select a template before adding questions.";
      setStatus({ kind: "error", text: message });
      return;
    }
    const prompt = modalNewQuestionPrompt.trim();
    if (!prompt) {
      setStatus({ kind: "error", text: "Provide question text before creating it." });
      return;
    }

    setSubmittingAddQuestionModal(true);
    try {
      const created =
        addQuestionModal.context === "SURVEY"
          ? await createAndAddQuestionToSurveyCategory(
              addQuestionModal.category,
              modalNewQuestionPrompt,
              modalNewQuestionInstructions
            )
          : await createAndAddQuestionToTemplateCategory(
              addQuestionModal.category,
              modalNewQuestionPrompt,
              modalNewQuestionInstructions
            );
      if (!created) {
        return;
      }
      closeAddQuestionModal();
    } finally {
      setSubmittingAddQuestionModal(false);
    }
  }

  const categoryOrder = sessionDraft ? orderedCategories(sessionDraft.questions) : [];
  const resultsSubmissionCount = results?.submissions.length || 0;
  const questionResponseCountByQuestionId = React.useMemo(() => {
    const counts = new Map<string, number>();
    if (!selectedSession || !results) return counts;

    const questionIdBySessionQuestionId = new Map(
      selectedSession.questions.map((entry) => [entry.sessionQuestionId, entry.questionId] as const)
    );

    for (const entry of results.questionAverages) {
      const questionId = questionIdBySessionQuestionId.get(entry.sessionQuestionId);
      if (!questionId) continue;
      counts.set(questionId, (counts.get(questionId) || 0) + entry.responseCount);
    }

    return counts;
  }, [results, selectedSession]);
  const templateCategoryOrder = templateLibraryDraft ? orderedCategories(templateLibraryDraft.questions) : [];
  const templateLibraryDirty = React.useMemo(() => {
    if (!templateLibraryDraft) return false;
    if (!templateLibraryDraft.id) {
      return (
        templateLibraryDraft.name.trim().length > 0 ||
        templateLibraryDraft.description.trim().length > 0 ||
        templateLibraryDraft.questions.length > 0
      );
    }
    const sourceTemplate = libraryTemplates.find((entry) => entry.id === templateLibraryDraft.id);
    if (!sourceTemplate) return true;
    return (
      JSON.stringify(normalizeTemplateDraftPayload(templateLibraryDraft)) !==
      JSON.stringify(normalizeTemplateDraftPayload(toTemplateLibraryDraft(sourceTemplate)))
    );
  }, [libraryTemplates, templateLibraryDraft]);

  return (
    <>
      <h2>Survey Management</h2>
      <p className="muted">
        Create, edit, and launch webinar surveys. Questions are organized by category and include participant-facing
        instructions.
      </p>
      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

      <div className="detail-tabs" role="tablist" aria-label="Survey management sections">
        <button
          type="button"
          role="tab"
          className={`detail-tab ${activeTab === "SURVEYS" ? "active" : ""}`}
          aria-selected={activeTab === "SURVEYS"}
          onClick={() => setActiveTab("SURVEYS")}
        >
          Company Surveys
        </button>
        <button
          type="button"
          role="tab"
          className={`detail-tab ${activeTab === "TEMPLATE_LIBRARY" ? "active" : ""}`}
          aria-selected={activeTab === "TEMPLATE_LIBRARY"}
          onClick={() => setActiveTab("TEMPLATE_LIBRARY")}
        >
          Survey Template Library
        </button>
      </div>

      {activeTab === "SURVEYS" ? (
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

          <div className="actions">
            <button
              className="secondary"
              type="button"
              onClick={() => openAddSurveyModal()}
              disabled={!selectedCompanyId}
            >
              Add Survey
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
              {questionEditingLocked ? (
                <p className="muted">Set status to Draft to edit questions.</p>
              ) : null}
              {hasResponses ? (
                <p className="muted">
                  Existing responses are retained for questions that remain in the survey. Removing a question will
                  remove responses tied to that question.
                </p>
              ) : null}

              <p className="detail-label">Question Categories</p>
              <div className="admin-survey-category-stack">
                {categoryOrder.map((category, categoryOrderIndex) => {
                  const questionIndexes = questionIndexesForCategory(sessionDraft.questions, category);
                  return (
                    <section key={category} className="admin-survey-category-panel">
                      <div className="pipeline-card-head">
                        <strong>{category}</strong>
                        <div className="actions" style={{ marginTop: 0 }}>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => moveCategory(category, -1)}
                            disabled={categoryOrderIndex === 0 || questionEditingLocked}
                          >
                            Move up
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => moveCategory(category, 1)}
                            disabled={categoryOrderIndex === categoryOrder.length - 1 || questionEditingLocked}
                          >
                            Move down
                          </button>
                        </div>
                      </div>

                      <div className="admin-survey-question-list">
                        {questionIndexes.map((globalQuestionIndex, questionIndexWithinCategory) => {
                          const question = sessionDraft.questions[globalQuestionIndex];
                          const questionResponseCount = questionResponseCountByQuestionId.get(question.questionId) || 0;
                          return (
                            <div key={`${question.questionId}-${globalQuestionIndex}`} className="admin-survey-question-row">
                              <div className="admin-survey-question-fields">
                                <label>Question {questionIndexWithinCategory + 1}</label>
                                <span className="muted">
                                  {loadingResults
                                    ? "DB responses: loading..."
                                    : `DB responses: ${questionResponseCount}`}
                                </span>
                                <input
                                  value={question.prompt}
                                  onChange={(event) =>
                                    updateDraftQuestion(globalQuestionIndex, { prompt: event.target.value })
                                  }
                                  disabled={questionEditingLocked}
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
                                  disabled={questionEditingLocked}
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
                                    disabled={questionIndexWithinCategory === 0 || questionEditingLocked}
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
                                      questionIndexWithinCategory === questionIndexes.length - 1 || questionEditingLocked
                                    }
                                  >
                                    Down
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => removeDraftQuestion(globalQuestionIndex)}
                                    disabled={questionEditingLocked}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="admin-survey-category-link-row">
                        <button
                          className="admin-survey-add-question-link"
                          type="button"
                          onClick={() => openAddQuestionModal("SURVEY", category)}
                        >
                          Add Question
                        </button>
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
                  <strong>Template Library</strong>
                </div>
                <p className="muted">
                  Manage templates in the shared library, then add this survey as a new template or use it to update
                  an existing template's question sequence.
                </p>
                <div className="detail-grid">
                  <div>
                    <label htmlFor="admin-library-template-target">Existing template</label>
                    <select
                      id="admin-library-template-target"
                      value={libraryTemplateId}
                      onChange={(event) => setLibraryTemplateId(event.target.value)}
                      disabled={libraryTemplateActionLocked || libraryTemplates.length === 0}
                    >
                      {libraryTemplates.length === 0 ? <option value="">No templates available</option> : null}
                      {libraryTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {`${template.name}${template.isStandard ? " (Standard)" : ""}${
                            template.isActive ? "" : " (Inactive)"
                          }`}
                        </option>
                      ))}
                    </select>
                    {selectedLibraryTemplate ? (
                      <p className="muted">
                        {selectedLibraryTemplate.isActive ? "Active" : "Inactive"} •{" "}
                        Used {selectedLibraryTemplate.usageCount} time
                        {selectedLibraryTemplate.usageCount === 1 ? "" : "s"} •{" "}
                        {selectedLibraryTemplate.questionCount} question
                        {selectedLibraryTemplate.questionCount === 1 ? "" : "s"} • Last used{" "}
                        {formatDate(selectedLibraryTemplate.lastUsedAt)}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="admin-library-template-name">Template name</label>
                    <input
                      id="admin-library-template-name"
                      value={libraryTemplateName}
                      onChange={(event) => setLibraryTemplateName(event.target.value)}
                      disabled={libraryTemplateActionLocked}
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-library-template-description">Template description</label>
                    <textarea
                      id="admin-library-template-description"
                      value={libraryTemplateDescription}
                      onChange={(event) => setLibraryTemplateDescription(event.target.value)}
                      rows={2}
                      disabled={libraryTemplateActionLocked}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() =>
                      void toggleLibraryTemplateActive(!(selectedLibraryTemplate?.isActive ?? false))
                    }
                    disabled={
                      libraryTemplateActionLocked ||
                      !selectedLibraryTemplate ||
                      (selectedLibraryTemplate.isStandard && selectedLibraryTemplate.isActive)
                    }
                  >
                    {updatingLibraryTemplateId === selectedLibraryTemplate?.id
                      ? "Saving..."
                      : selectedLibraryTemplate?.isActive
                        ? "Deactivate Template"
                        : "Activate Template"}
                  </button>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => void deleteLibraryTemplate()}
                    disabled={
                      libraryTemplateActionLocked || !selectedLibraryTemplate || selectedLibraryTemplate.isStandard
                    }
                  >
                    {deletingLibraryTemplateId === selectedLibraryTemplate?.id
                      ? "Deleting..."
                      : "Delete Template"}
                  </button>
                </div>
                {selectedLibraryTemplate?.isStandard ? (
                  <p className="muted">Standard templates can be updated, but not deactivated or deleted.</p>
                ) : null}
                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => openAddLibraryTemplateModal()}
                    disabled={libraryTemplateActionLocked || !sessionDraft || sessionDraft.questions.length === 0}
                  >
                    Add Template
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void saveTemplateFromCurrentSurvey("UPDATE")}
                    disabled={
                      libraryTemplateActionLocked ||
                      !libraryTemplateId ||
                      !sessionDraft ||
                      sessionDraft.questions.length === 0
                    }
                  >
                    {savingTemplateMode === "UPDATE"
                      ? "Updating..."
                      : `Update ${selectedLibraryTemplate?.isStandard ? "Standard " : ""}Template`}
                  </button>
                </div>
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
                                  <summary>
                                    {`${entry.answerCount} scores${
                                      entry.skippedAnswerCount > 0
                                        ? ` • ${entry.skippedAnswerCount} skipped`
                                        : ""
                                    }`}
                                  </summary>
                                  <div className="admin-survey-submission-answers">
                                    {entry.answers.map((answer) => (
                                      <p key={answer.answerId}>
                                        <strong>{answer.category}:</strong> {answer.prompt} ={" "}
                                        {answer.isSkipped || answer.score === null
                                          ? "Skipped"
                                          : answer.score}
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
      ) : (
      <div className="grid admin-survey-layout">
        <section className="panel" aria-label="Template library list panel">
          <div className="pipeline-card-head">
            <strong>Survey Template Library</strong>
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

          <p className="muted">Templates are shared across companies.</p>

          <div className="actions">
            <button className="secondary" type="button" onClick={() => beginNewTemplateLibraryDraft()}>
              Add Template
            </button>
          </div>

          {loadingSessions ? <p className="muted">Loading templates...</p> : null}
          {!loadingSessions && libraryTemplates.length === 0 ? <p className="muted">No templates found.</p> : null}

          <div className="list-container">
            {libraryTemplates.map((template) => {
              const active = selectedTemplateLibraryId === template.id;
              return (
                <div
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  className={`list-row ${active ? "active" : ""}`}
                  onClick={() => setSelectedTemplateLibraryId(template.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTemplateLibraryId(template.id);
                    }
                  }}
                >
                  <div className="list-row-main">
                    <strong>{template.name}</strong>
                    <span className="muted">
                      {template.questionCount} question{template.questionCount === 1 ? "" : "s"} • Used{" "}
                      {template.usageCount} time{template.usageCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="list-row-meta">
                    <span className={`status-pill ${template.isActive ? "running" : "draft"}`}>
                      {template.isActive ? "Active" : "Inactive"}
                    </span>
                    {template.isStandard ? <span className="status-pill queued">Standard</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel" aria-label="Template library editor panel">
          {!templateLibraryDraft ? (
            <p className="muted">Select a template to edit, or click Add Template.</p>
          ) : (
            <div className="detail-card">
              <div className="detail-head">
                <h3>{templateLibraryDraft.id ? templateLibraryDraft.name : "New Survey Template"}</h3>
              </div>

              <div className="detail-grid">
                <div>
                  <label htmlFor="admin-template-library-name">Template name</label>
                  <input
                    id="admin-template-library-name"
                    value={templateLibraryDraft.name}
                    onChange={(event) =>
                      setTemplateLibraryDraft((current) =>
                        current
                          ? {
                              ...current,
                              name: event.target.value
                            }
                          : current
                      )
                    }
                    disabled={templateLibraryActionLocked}
                  />
                </div>
                <div>
                  <label htmlFor="admin-template-library-status">Status</label>
                  <select
                    id="admin-template-library-status"
                    value={templateLibraryDraft.isActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(event) =>
                      setTemplateLibraryDraft((current) =>
                        current
                          ? {
                              ...current,
                              isActive: event.target.value === "ACTIVE"
                            }
                          : current
                      )
                    }
                    disabled={templateLibraryActionLocked || templateLibraryDraft.isStandard}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="admin-template-library-description">Template description</label>
                  <textarea
                    id="admin-template-library-description"
                    value={templateLibraryDraft.description}
                    onChange={(event) =>
                      setTemplateLibraryDraft((current) =>
                        current
                          ? {
                              ...current,
                              description: event.target.value
                            }
                          : current
                      )
                    }
                    rows={2}
                    disabled={templateLibraryActionLocked}
                  />
                </div>
              </div>

              <p className="muted">
                Usage: {templateLibraryDraft.usageCount} survey session
                {templateLibraryDraft.usageCount === 1 ? "" : "s"}.
              </p>
              {templateLibraryDraft.isStandard ? (
                <p className="muted">Standard templates can be updated, but not deactivated or deleted.</p>
              ) : null}

              <p className="detail-label">Template Categories</p>
              {templateCategoryOrder.length === 0 ? (
                <p className="muted">No categories yet. Add a new category below.</p>
              ) : null}
              <div className="admin-survey-category-stack">
                {templateCategoryOrder.map((category, categoryOrderIndex) => {
                  const questionIndexes = questionIndexesForCategory(templateLibraryDraft.questions, category);

                  return (
                    <section key={category} className="admin-survey-category-panel">
                      <div className="pipeline-card-head">
                        <strong>{category}</strong>
                        <div className="actions" style={{ marginTop: 0 }}>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => moveTemplateLibraryCategory(category, -1)}
                            disabled={templateLibraryActionLocked || categoryOrderIndex === 0}
                          >
                            Move up
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => moveTemplateLibraryCategory(category, 1)}
                            disabled={templateLibraryActionLocked || categoryOrderIndex === templateCategoryOrder.length - 1}
                          >
                            Move down
                          </button>
                        </div>
                      </div>

                      <div className="admin-survey-question-list">
                        {questionIndexes.map((globalQuestionIndex, questionIndexWithinCategory) => {
                          const question = templateLibraryDraft.questions[globalQuestionIndex];
                          return (
                            <div key={`${question.questionId}-${globalQuestionIndex}`} className="admin-survey-question-row">
                              <div className="admin-survey-question-fields">
                                <label>Question {questionIndexWithinCategory + 1}</label>
                                <input
                                  value={question.prompt}
                                  onChange={(event) =>
                                    updateTemplateLibraryQuestion(globalQuestionIndex, { prompt: event.target.value })
                                  }
                                  disabled={templateLibraryActionLocked}
                                />
                                <label>Instructions</label>
                                <textarea
                                  value={question.instructions || ""}
                                  onChange={(event) =>
                                    updateTemplateLibraryQuestion(globalQuestionIndex, {
                                      instructions: event.target.value
                                    })
                                  }
                                  rows={2}
                                  disabled={templateLibraryActionLocked}
                                />
                                <div className="actions">
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() =>
                                      moveTemplateLibraryQuestionWithinCategory(
                                        category,
                                        questionIndexWithinCategory,
                                        -1
                                      )
                                    }
                                    disabled={templateLibraryActionLocked || questionIndexWithinCategory === 0}
                                  >
                                    Up
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() =>
                                      moveTemplateLibraryQuestionWithinCategory(
                                        category,
                                        questionIndexWithinCategory,
                                        1
                                      )
                                    }
                                    disabled={
                                      templateLibraryActionLocked ||
                                      questionIndexWithinCategory === questionIndexes.length - 1
                                    }
                                  >
                                    Down
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => removeTemplateLibraryQuestion(globalQuestionIndex)}
                                    disabled={templateLibraryActionLocked}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="admin-survey-category-link-row">
                        <button
                          className="admin-survey-add-question-link"
                          type="button"
                          onClick={() => openAddQuestionModal("TEMPLATE", category)}
                        >
                          Add Question
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>

              <p className="detail-label">Add New Category</p>
              <div className="detail-grid admin-survey-category-builder">
                <div>
                  <label htmlFor="admin-template-new-category-name">Category name</label>
                  <input
                    id="admin-template-new-category-name"
                    value={templateNewCategoryName}
                    onChange={(event) => setTemplateNewCategoryName(event.target.value)}
                    placeholder="e.g. Workflow Fit"
                    disabled={templateLibraryActionLocked}
                  />
                </div>
                <div>
                  <label htmlFor="admin-template-new-category-question">First question</label>
                  <input
                    id="admin-template-new-category-question"
                    value={templateNewCategoryPrompt}
                    onChange={(event) => setTemplateNewCategoryPrompt(event.target.value)}
                    placeholder="First question for this category"
                    disabled={templateLibraryActionLocked}
                  />
                </div>
                <div>
                  <label htmlFor="admin-template-new-category-instructions">Instructions</label>
                  <textarea
                    id="admin-template-new-category-instructions"
                    value={templateNewCategoryInstructions}
                    onChange={(event) => setTemplateNewCategoryInstructions(event.target.value)}
                    rows={2}
                    placeholder="Optional instructions shown below the question"
                    disabled={templateLibraryActionLocked}
                  />
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void createAndAddNewTemplateCategory()}
                    disabled={
                      templateLibraryActionLocked ||
                      !templateNewCategoryName.trim() ||
                      !templateNewCategoryPrompt.trim()
                    }
                  >
                    {addingTemplateCategory ? "Adding..." : "Add Category"}
                  </button>
                </div>
              </div>

              <div className="actions">
                {templateLibraryDirty ? <span className="muted">Unsaved changes</span> : <span className="muted">Saved</span>}
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => resetTemplateLibraryDraft()}
                  disabled={templateLibraryActionLocked || !templateLibraryDirty}
                >
                  Reset
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void saveTemplateLibraryDraft()}
                  disabled={templateLibraryActionLocked || !templateLibraryDirty}
                >
                  {savingTemplateLibraryDraft
                    ? "Saving..."
                    : templateLibraryDraft.id
                      ? "Save Template"
                      : "Create Template"}
                </button>
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => void deleteTemplateLibraryDraft()}
                  disabled={
                    templateLibraryActionLocked ||
                    !templateLibraryDraft.id ||
                    templateLibraryDraft.isStandard
                  }
                >
                  {deletingTemplateLibraryDraftId === templateLibraryDraft.id
                    ? "Deleting..."
                    : "Delete Template"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      )}

      {showAddSurveyModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => closeAddSurveyModal()}>
          <div
            className="pipeline-note-modal admin-survey-create-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>Add Company Survey</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => closeAddSurveyModal()}
                disabled={creatingSurvey}
                aria-label="Close add survey dialog"
              >
                ×
              </button>
            </div>

            <p className="muted">Create a survey from the template library, another survey, or the active question bank.</p>

            <div className="detail-grid admin-survey-category-builder">
              <div>
                <label>Company</label>
                <input value={selectedCompany?.name || ""} readOnly />
              </div>
              <div>
                <label htmlFor="admin-new-survey-title-modal">Survey title</label>
                <input
                  id="admin-new-survey-title-modal"
                  value={newSurveyTitle}
                  onChange={(event) => setNewSurveyTitle(event.target.value)}
                  placeholder="e.g. Screening Webinar Survey (March)"
                  disabled={creatingSurvey}
                />
              </div>
              <div>
                <label htmlFor="admin-new-survey-source-mode-modal">Source</label>
                <select
                  id="admin-new-survey-source-mode-modal"
                  value={newSurveySourceMode}
                  onChange={(event) =>
                    setNewSurveySourceMode(event.target.value as "TEMPLATE" | "SESSION" | "QUESTIONS")
                  }
                  disabled={creatingSurvey}
                >
                  <option value="TEMPLATE">Survey Template Library</option>
                  <option value="SESSION">Existing Survey</option>
                  <option value="QUESTIONS">Active Question Bank</option>
                </select>
              </div>

              {newSurveySourceMode === "TEMPLATE" ? (
                <div>
                  <label htmlFor="admin-new-survey-template-modal">Template</label>
                  <select
                    id="admin-new-survey-template-modal"
                    value={newSurveyTemplateId}
                    onChange={(event) => setNewSurveyTemplateId(event.target.value)}
                    disabled={creatingSurvey || surveyTemplates.length === 0}
                  >
                    {surveyTemplates.length === 0 ? <option value="">No templates available</option> : null}
                    {surveyTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {`${template.name} (${template.questionCount} questions${
                          template.isStandard ? ", Standard" : ""
                        })`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {newSurveySourceMode === "SESSION" ? (
                <div>
                  <label htmlFor="admin-new-survey-source-session-modal">Existing survey</label>
                  <select
                    id="admin-new-survey-source-session-modal"
                    value={newSurveySourceSessionId}
                    onChange={(event) => setNewSurveySourceSessionId(event.target.value)}
                    disabled={creatingSurvey || sourceSessions.length === 0}
                  >
                    {sourceSessions.length === 0 ? <option value="">No surveys available</option> : null}
                    {sourceSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {`${session.title} — ${session.companyName}${
                          session.templateName ? ` (${session.templateName})` : ""
                        }`}
                      </option>
                    ))}
                  </select>
                  <p className="muted">Includes surveys created for any company.</p>
                </div>
              ) : null}

              {newSurveySourceMode === "QUESTIONS" ? (
                <p className="muted">Creates a survey from the currently active question library.</p>
              ) : null}
            </div>

            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => void createSurvey()}
                disabled={
                  creatingSurvey ||
                  !selectedCompanyId ||
                  (newSurveySourceMode === "TEMPLATE" && !newSurveyTemplateId && surveyTemplates.length > 0) ||
                  (newSurveySourceMode === "SESSION" && !newSurveySourceSessionId && sourceSessions.length > 0) ||
                  (newSurveySourceMode === "SESSION" && sourceSessions.length === 0)
                }
              >
                {creatingSurvey ? "Creating..." : "Add Survey"}
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={() => closeAddSurveyModal()}
                disabled={creatingSurvey}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddLibraryTemplateModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => closeAddLibraryTemplateModal()}>
          <div
            className="pipeline-note-modal admin-survey-template-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>Add Template to Library</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => closeAddLibraryTemplateModal()}
                disabled={savingTemplateMode === "CREATE"}
                aria-label="Close add template dialog"
              >
                ×
              </button>
            </div>

            <p className="muted">
              Save this survey&apos;s current question set as a new template for future company surveys.
            </p>

            <div className="detail-grid admin-survey-category-builder">
              <div>
                <label htmlFor="admin-company-template-modal-name">Template name</label>
                <input
                  id="admin-company-template-modal-name"
                  value={newLibraryTemplateName}
                  onChange={(event) => setNewLibraryTemplateName(event.target.value)}
                  placeholder="Template name"
                  disabled={savingTemplateMode === "CREATE"}
                />
              </div>
              <div>
                <label htmlFor="admin-company-template-modal-description">Template description</label>
                <textarea
                  id="admin-company-template-modal-description"
                  value={newLibraryTemplateDescription}
                  onChange={(event) => setNewLibraryTemplateDescription(event.target.value)}
                  rows={2}
                  placeholder="Optional description"
                  disabled={savingTemplateMode === "CREATE"}
                />
              </div>
            </div>

            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => void saveNewLibraryTemplateFromModal()}
                disabled={savingTemplateMode === "CREATE" || !newLibraryTemplateName.trim()}
              >
                {savingTemplateMode === "CREATE" ? "Saving..." : "Add Template"}
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={() => closeAddLibraryTemplateModal()}
                disabled={savingTemplateMode === "CREATE"}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addQuestionModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => closeAddQuestionModal()}>
          <div
            className="pipeline-note-modal admin-survey-add-question-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>{`Add Question to ${addQuestionModal.category}`}</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => closeAddQuestionModal()}
                disabled={submittingAddQuestionModal}
                aria-label="Close add question dialog"
              >
                ×
              </button>
            </div>

            {addQuestionModal.context === "SURVEY" && questionEditingLocked ? (
              <p className="muted">Set this survey to Draft to add questions.</p>
            ) : null}

            <div className="detail-grid admin-survey-category-builder">
              <div>
                <label htmlFor="admin-add-question-existing-select">Add existing question</label>
                <select
                  id="admin-add-question-existing-select"
                  value={modalExistingQuestionId}
                  onChange={(event) => setModalExistingQuestionId(event.target.value)}
                  disabled={submittingAddQuestionModal || addQuestionModalLocked}
                >
                  {modalAvailableQuestions.length === 0 ? (
                    <option value="">No available active questions</option>
                  ) : null}
                  {modalAvailableQuestions.map((entry) => (
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
                  onClick={() => addExistingQuestionFromModal()}
                  disabled={submittingAddQuestionModal || addQuestionModalLocked || !modalExistingQuestionId}
                >
                  Add Existing Question
                </button>
              </div>
            </div>

            <div className="detail-grid admin-survey-category-builder">
              <div>
                <label htmlFor="admin-add-question-new-prompt">Create new question</label>
                <input
                  id="admin-add-question-new-prompt"
                  value={modalNewQuestionPrompt}
                  onChange={(event) => setModalNewQuestionPrompt(event.target.value)}
                  placeholder="Question prompt"
                  disabled={submittingAddQuestionModal || addQuestionModalLocked}
                />
              </div>
              <div>
                <label htmlFor="admin-add-question-new-instructions">Instructions</label>
                <textarea
                  id="admin-add-question-new-instructions"
                  value={modalNewQuestionInstructions}
                  onChange={(event) => setModalNewQuestionInstructions(event.target.value)}
                  rows={2}
                  placeholder="Optional instructions shown below the question"
                  disabled={submittingAddQuestionModal || addQuestionModalLocked}
                />
              </div>
              <div className="actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void createQuestionFromModal()}
                  disabled={
                    submittingAddQuestionModal ||
                    addQuestionModalLocked ||
                    !modalNewQuestionPrompt.trim()
                  }
                >
                  {submittingAddQuestionModal ? "Adding..." : `Create in ${addQuestionModal.category}`}
                </button>
              </div>
            </div>

            <div className="actions">
              <button
                className="ghost small"
                type="button"
                onClick={() => closeAddQuestionModal()}
                disabled={submittingAddQuestionModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
