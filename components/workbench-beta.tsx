"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AddContactAction,
  type CreateEntityAction,
  type LinkCompanyCoInvestorAction,
  type NarrativeAction,
  type NarrativeEntityType,
  type NarrativeExecutionResult,
  type NarrativePlan,
  type UpdateEntityAction
} from "@/lib/narrative-agent-types";
import {
  type WorkbenchClarificationAnswer,
  type WorkbenchDraft,
  type WorkbenchExecuteResponse,
  workbenchDraftSchema,
  workbenchExecuteResponseSchema,
  workbenchPlanResponseSchema
} from "@/lib/workbench-v2-types";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  kind: "text" | "plan" | "result" | "error";
  text: string;
};

const actionKindOptions: Array<{ value: NarrativeAction["kind"]; label: string }> = [
  { value: "CREATE_ENTITY", label: "Create Entity" },
  { value: "UPDATE_ENTITY", label: "Update Entity" },
  { value: "ADD_CONTACT", label: "Add Contact" },
  { value: "LINK_COMPANY_CO_INVESTOR", label: "Link Company + Co-Investor" }
];

const entityTypeOptions: Array<{ value: NarrativeEntityType; label: string }> = [
  { value: "HEALTH_SYSTEM", label: "Health System" },
  { value: "COMPANY", label: "Company" },
  { value: "CO_INVESTOR", label: "Co-Investor" }
];

function createMessageId(role: "assistant" | "user") {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function entityTypeLabel(entityType: NarrativeEntityType) {
  return entityTypeOptions.find((entry) => entry.value === entityType)?.label || entityType;
}

function actionLabel(action: NarrativeAction) {
  if (action.kind === "CREATE_ENTITY") {
    return `Create ${entityTypeLabel(action.entityType)}: ${action.draft.name || "Unnamed"}`;
  }
  if (action.kind === "UPDATE_ENTITY") {
    return `Update ${entityTypeLabel(action.entityType)}: ${action.targetName || "Unnamed"}`;
  }
  if (action.kind === "ADD_CONTACT") {
    return `Add Contact (${action.contact.name || "Unnamed"}) to ${action.parentName || "Unknown parent"}`;
  }
  return `Link ${action.companyName || "Company"} ↔ ${action.coInvestorName || "Co-Investor"}`;
}

function summarizePlan(plan: NarrativePlan) {
  return `I drafted ${plan.actions.length} step${plan.actions.length === 1 ? "" : "s"}. Review and edit before executing.`;
}

function generateActionId(kind: NarrativeAction["kind"]) {
  return `${kind.toLowerCase().replace(/_/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDefaultAction(kind: NarrativeAction["kind"]): NarrativeAction {
  const id = generateActionId(kind);
  if (kind === "CREATE_ENTITY") {
    return {
      id,
      include: true,
      kind: "CREATE_ENTITY",
      entityType: "COMPANY",
      draft: { name: "" },
      existingMatches: [],
      webCandidates: [],
      selection: { mode: "CREATE_MANUAL" },
      issues: []
    };
  }
  if (kind === "UPDATE_ENTITY") {
    return {
      id,
      include: true,
      kind: "UPDATE_ENTITY",
      entityType: "COMPANY",
      targetName: "",
      patch: {},
      targetMatches: [],
      issues: []
    };
  }
  if (kind === "ADD_CONTACT") {
    return {
      id,
      include: true,
      kind: "ADD_CONTACT",
      parentType: "COMPANY",
      parentName: "",
      roleType: "COMPANY_CONTACT",
      contact: {
        name: "",
        title: "",
        relationshipTitle: "",
        email: "",
        phone: "",
        linkedinUrl: ""
      },
      parentMatches: [],
      issues: []
    };
  }
  return {
    id,
    include: true,
    kind: "LINK_COMPANY_CO_INVESTOR",
    companyName: "",
    coInvestorName: "",
    relationshipType: "INVESTOR",
    notes: "",
    investmentAmountUsd: null,
    companyMatches: [],
    coInvestorMatches: [],
    issues: []
  };
}

function getActionDependencyIds(action: NarrativeAction): string[] {
  if (action.kind === "UPDATE_ENTITY") {
    if (action.selectedTargetId) return [];
    return action.linkedCreateActionId ? [action.linkedCreateActionId] : [];
  }

  if (action.kind === "ADD_CONTACT") {
    if (action.selectedParentId) return [];
    return action.linkedCreateActionId ? [action.linkedCreateActionId] : [];
  }

  if (action.kind === "LINK_COMPANY_CO_INVESTOR") {
    const dependencyIds: string[] = [];
    if (!action.selectedCompanyId && action.companyCreateActionId) {
      dependencyIds.push(action.companyCreateActionId);
    }
    if (!action.selectedCoInvestorId && action.coInvestorCreateActionId) {
      dependencyIds.push(action.coInvestorCreateActionId);
    }
    return dependencyIds;
  }

  return [];
}

function buildExecutionOrder(actions: NarrativeAction[]): string[] {
  const includedActions = actions.filter((action) => action.include);
  const actionById = new Map(includedActions.map((action) => [action.id, action]));
  const indexById = new Map(actions.map((action, index) => [action.id, index]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const action of includedActions) {
    const dependencyIds = getActionDependencyIds(action).filter((dependencyId) =>
      actionById.has(dependencyId)
    );
    inDegree.set(action.id, dependencyIds.length);

    for (const dependencyId of dependencyIds) {
      const current = dependents.get(dependencyId) || [];
      current.push(action.id);
      dependents.set(dependencyId, current);
    }
  }

  const queue = includedActions
    .filter((action) => (inDegree.get(action.id) || 0) === 0)
    .map((action) => action.id)
    .sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));

  const orderedIds: string[] = [];
  while (queue.length > 0) {
    const nextId = queue.shift();
    if (!nextId) break;
    orderedIds.push(nextId);

    for (const dependentId of dependents.get(nextId) || []) {
      const nextDegree = (inDegree.get(dependentId) || 0) - 1;
      inDegree.set(dependentId, nextDegree);
      if (nextDegree === 0) {
        queue.push(dependentId);
      }
    }
    queue.sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));
  }

  if (orderedIds.length < includedActions.length) {
    const unresolved = includedActions
      .map((action) => action.id)
      .filter((id) => !orderedIds.includes(id))
      .sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));
    orderedIds.push(...unresolved);
  }

  return orderedIds;
}

function buildPhraseForPlanIntent(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("build execution plan") ||
    normalized.includes("generate execution plan") ||
    normalized.includes("draft execution plan") ||
    normalized.includes("requirements confirmed")
  );
}

function collectActionValidationIssues(
  action: NarrativeAction,
  actionById: Map<string, NarrativeAction>
): string[] {
  if (!action.include) return [];
  const issues: string[] = [];

  if (action.kind === "CREATE_ENTITY") {
    if (!action.draft.name.trim()) {
      issues.push("Create action requires a name.");
    }
    if (action.selection.mode === "USE_EXISTING" && !action.selection.existingId) {
      issues.push("Select existing record or switch create mode.");
    }
  }

  if (action.kind === "UPDATE_ENTITY") {
    if (!action.selectedTargetId && !action.linkedCreateActionId) {
      issues.push("Update action needs a target selection or create dependency.");
    }
    if (action.linkedCreateActionId) {
      const dependency = actionById.get(action.linkedCreateActionId);
      if (dependency && !dependency.include) {
        issues.push("Update action depends on a create step that is not selected.");
      }
    }
  }

  if (action.kind === "ADD_CONTACT") {
    if (!action.contact.name.trim()) {
      issues.push("Contact action requires contact name.");
    }
    if (!action.selectedParentId && !action.linkedCreateActionId) {
      issues.push("Contact action needs a parent selection or create dependency.");
    }
    if (action.linkedCreateActionId) {
      const dependency = actionById.get(action.linkedCreateActionId);
      if (dependency && !dependency.include) {
        issues.push("Contact action depends on a create step that is not selected.");
      }
    }
  }

  if (action.kind === "LINK_COMPANY_CO_INVESTOR") {
    if (!action.selectedCompanyId && !action.companyCreateActionId) {
      issues.push("Link action needs company selection or create dependency.");
    }
    if (!action.selectedCoInvestorId && !action.coInvestorCreateActionId) {
      issues.push("Link action needs co-investor selection or create dependency.");
    }
    if (action.companyCreateActionId) {
      const dependency = actionById.get(action.companyCreateActionId);
      if (dependency && !dependency.include) {
        issues.push("Link action depends on a company create step that is not selected.");
      }
    }
    if (action.coInvestorCreateActionId) {
      const dependency = actionById.get(action.coInvestorCreateActionId);
      if (dependency && !dependency.include) {
        issues.push("Link action depends on a co-investor create step that is not selected.");
      }
    }
  }

  return issues;
}

export function WorkbenchBeta() {
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      kind: "text",
      text:
        "Describe the data changes you need. I will gather requirements, ask clarifications locally, then build an execution plan."
    }
  ]);
  const [draft, setDraft] = useState<WorkbenchDraft | null>(null);
  const [plan, setPlan] = useState<NarrativePlan | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<WorkbenchClarificationAnswer[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [newActionKind, setNewActionKind] = useState<NarrativeAction["kind"]>("CREATE_ENTITY");
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionReport, setExecutionReport] = useState<WorkbenchExecuteResponse | null>(null);
  const [resultByActionId, setResultByActionId] = useState<Record<string, NarrativeExecutionResult>>({});
  const [completedActionIds, setCompletedActionIds] = useState<string[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [baseConversation, setBaseConversation] = useState("");

  const currentQuestion = draft?.clarifications[questionIndex] || null;
  const allQuestionsAnswered = Boolean(
    draft && draft.clarifications.length > 0 && questionIndex >= draft.clarifications.length
  );
  const actionById = useMemo(
    () => new Map((plan?.actions || []).map((action) => [action.id, action])),
    [plan]
  );
  const executionOrder = useMemo(() => (plan ? buildExecutionOrder(plan.actions) : []), [plan]);
  const completedSet = useMemo(() => new Set(completedActionIds), [completedActionIds]);
  const executionResults = useMemo(() => {
    if (!plan) return [];
    return plan.actions
      .map((action) => resultByActionId[action.id])
      .filter((entry): entry is NarrativeExecutionResult => Boolean(entry));
  }, [plan, resultByActionId]);
  const executionCounts = useMemo(() => {
    const executed = executionResults.filter((entry) => entry.status === "EXECUTED").length;
    const failed = executionResults.filter((entry) => entry.status === "FAILED").length;
    const skipped = executionResults.filter((entry) => entry.status === "SKIPPED").length;
    return { executed, failed, skipped };
  }, [executionResults]);
  const wizardActionIds = executionOrder;
  const wizardActionId = wizardActionIds[wizardIndex] || null;
  const wizardAction = wizardActionId ? actionById.get(wizardActionId) || null : null;
  const wizardProgressPercent =
    wizardActionIds.length > 0 ? Math.round(((wizardIndex + 1) / wizardActionIds.length) * 100) : 0;

  const actionValidationById = useMemo(() => {
    const validation = new Map<string, string[]>();
    if (!plan) return validation;
    for (const action of plan.actions) {
      validation.set(action.id, collectActionValidationIssues(action, actionById));
    }
    return validation;
  }, [plan, actionById]);

  const nextRunnableActionId = useMemo(() => {
    if (!plan) return null;

    for (const actionId of executionOrder) {
      const action = actionById.get(actionId);
      if (!action || !action.include) continue;
      if (completedSet.has(actionId)) continue;
      if ((actionValidationById.get(actionId) || []).length > 0) continue;

      const dependencyIds = getActionDependencyIds(action).filter((dependencyId) => {
        const dependencyAction = actionById.get(dependencyId);
        return Boolean(dependencyAction?.include);
      });
      if (dependencyIds.every((dependencyId) => completedSet.has(dependencyId))) {
        return actionId;
      }
    }

    return null;
  }, [plan, executionOrder, actionById, completedSet, actionValidationById]);

  const wizardRuntimeIssues = useMemo(() => {
    if (!wizardAction) return [];
    return actionValidationById.get(wizardAction.id) || [];
  }, [wizardAction, actionValidationById]);
  const wizardCombinedIssues = useMemo(() => {
    if (!wizardAction) return [];
    return Array.from(new Set([...(wizardAction.issues || []), ...wizardRuntimeIssues]));
  }, [wizardAction, wizardRuntimeIssues]);
  const wizardDependencyLabels = useMemo(() => {
    if (!wizardAction) return [];
    return getActionDependencyIds(wizardAction)
      .map((dependencyId) => actionById.get(dependencyId))
      .filter((entry): entry is NarrativeAction => Boolean(entry))
      .map((entry) => actionLabel(entry));
  }, [wizardAction, actionById]);
  const wizardResult = wizardAction ? resultByActionId[wizardAction.id] : undefined;

  const wizardCanExecuteCurrent = useMemo(() => {
    if (!wizardAction || !wizardAction.include) return false;
    if (wizardRuntimeIssues.length > 0) return false;
    return wizardAction.id === nextRunnableActionId;
  }, [wizardAction, wizardRuntimeIssues, nextRunnableActionId]);

  const selectedCount = useMemo(
    () => (plan ? plan.actions.filter((action) => action.include).length : 0),
    [plan]
  );

  function appendMessage(next: Omit<ChatMessage, "id">) {
    setChatMessages((current) => [...current, { ...next, id: createMessageId(next.role) }]);
  }

  useEffect(() => {
    if (!wizardOpen) return;
    if (wizardActionIds.length === 0) {
      setWizardOpen(false);
      setWizardIndex(0);
      return;
    }
    if (wizardIndex >= wizardActionIds.length) {
      setWizardIndex(wizardActionIds.length - 1);
    }
  }, [wizardOpen, wizardActionIds, wizardIndex]);

  function resetAll() {
    setMessage("");
    setDraft(null);
    setPlan(null);
    setClarificationAnswers([]);
    setQuestionIndex(0);
    setStatus(null);
    setError(null);
    setExecutionReport(null);
    setResultByActionId({});
    setCompletedActionIds([]);
    setWizardOpen(false);
    setWizardIndex(0);
    setBaseConversation("");
    setChatMessages([
      {
        id: "assistant-welcome",
        role: "assistant",
        kind: "text",
        text:
          "Describe the data changes you need. I will gather requirements, ask clarifications locally, then build an execution plan."
      }
    ]);
  }

  async function runIntake(conversation: string) {
    setAnalyzing(true);
    setError(null);
    setStatus("Analyzing narrative and building draft operations...");
    setExecutionReport(null);
    setResultByActionId({});
    setCompletedActionIds([]);
    setWizardOpen(false);
    setWizardIndex(0);
    setPlan(null);
    setClarificationAnswers([]);
    setQuestionIndex(0);

    try {
      const response = await fetch("/api/workbench/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation })
      });
      const payload = (await response.json()) as { draft?: unknown; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to build draft");
      }
      const parsed = workbenchDraftSchema.safeParse(payload.draft);
      if (!parsed.success) {
        throw new Error("Workbench draft payload is invalid.");
      }

      setDraft(parsed.data);
      setBaseConversation(parsed.data.conversation);
      setStatus(
        `Drafted ${parsed.data.operations.length} candidate step${
          parsed.data.operations.length === 1 ? "" : "s"
        } with ${parsed.data.clarifications.length} clarification question${
          parsed.data.clarifications.length === 1 ? "" : "s"
        }.`
      );

      const summaryLines = [parsed.data.summary, ...parsed.data.warnings].filter(Boolean);
      if (summaryLines.length > 0) {
        appendMessage({
          role: "assistant",
          kind: "text",
          text: summaryLines.join("\n")
        });
      }

      const firstQuestion = parsed.data.clarifications[0];
      if (firstQuestion) {
        appendMessage({
          role: "assistant",
          kind: "text",
          text: `Clarification 1 of ${parsed.data.clarifications.length}: ${firstQuestion.question}`
        });
      } else {
        appendMessage({
          role: "assistant",
          kind: "text",
          text:
            "No clarification questions are blocking. Type 'Build execution plan' when you want the final plan."
        });
      }
    } catch (requestError) {
      const messageText =
        requestError instanceof Error ? requestError.message : "Failed to build draft";
      setError(messageText);
      setStatus(null);
      setDraft(null);
      appendMessage({
        role: "assistant",
        kind: "error",
        text: messageText
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function finalizePlan() {
    if (!draft) return;
    setAnalyzing(true);
    setError(null);
    setStatus("Finalizing execution plan...");

    try {
      const response = await fetch("/api/workbench/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: draft.sessionId,
          conversation: baseConversation || draft.conversation,
          operations: draft.operations,
          clarifications: clarificationAnswers
        })
      });
      const payload = (await response.json()) as { plan?: unknown; error?: string; sessionId?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to finalize plan");
      }

      const parsed = workbenchPlanResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Workbench plan payload is invalid.");
      }

      setPlan(parsed.data.plan);
      setResultByActionId({});
      setCompletedActionIds([]);
      setWizardOpen(false);
      setWizardIndex(0);
      setStatus(
        `Execution plan ready with ${parsed.data.plan.actions.length} step${
          parsed.data.plan.actions.length === 1 ? "" : "s"
        }.`
      );
      appendMessage({
        role: "assistant",
        kind: "plan",
        text: `${parsed.data.plan.summary} ${summarizePlan(parsed.data.plan)}`
      });
    } catch (requestError) {
      const messageText =
        requestError instanceof Error ? requestError.message : "Failed to finalize plan";
      setError(messageText);
      setStatus(null);
      appendMessage({
        role: "assistant",
        kind: "error",
        text: messageText
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function updatePlanAction(actionId: string, updater: (action: NarrativeAction) => NarrativeAction) {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions.map((action) => (action.id === actionId ? updater(action) : action))
      };
    });
  }

  function deletePlanAction(actionId: string) {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions.filter((action) => action.id !== actionId)
      };
    });
    setResultByActionId((current) => {
      const next = { ...current };
      delete next[actionId];
      return next;
    });
    setCompletedActionIds((current) => current.filter((id) => id !== actionId));
  }

  function addPlanAction(kind: NarrativeAction["kind"]) {
    const next = buildDefaultAction(kind);
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: [...current.actions, next]
      };
    });
  }

  function renderActionEditor(action: NarrativeAction) {
    if (action.kind === "CREATE_ENTITY") {
      return (
        <div className="agent-inline-fields">
          <label>
            Type
            <select
              value={action.entityType}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as CreateEntityAction),
                  entityType: event.target.value as NarrativeEntityType
                }))
              }
            >
              {entityTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              value={action.draft.name}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as CreateEntityAction),
                  draft: {
                    ...(current as CreateEntityAction).draft,
                    name: event.target.value
                  }
                }))
              }
            />
          </label>
          <label>
            Resolution
            <select
              value={action.selection.mode}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as CreateEntityAction),
                  selection: {
                    ...(current as CreateEntityAction).selection,
                    mode: event.target.value as CreateEntityAction["selection"]["mode"],
                    existingId:
                      event.target.value === "USE_EXISTING"
                        ? (current as CreateEntityAction).selection.existingId
                        : undefined
                  }
                }))
              }
            >
              <option value="USE_EXISTING">Use Existing</option>
              <option value="CREATE_MANUAL">Create Manual</option>
              <option value="CREATE_FROM_WEB">Create From Web</option>
            </select>
          </label>
          {action.selection.mode === "USE_EXISTING" ? (
            <label>
              Existing
              <select
                value={action.selection.existingId || ""}
                onChange={(event) =>
                  updatePlanAction(action.id, (current) => ({
                    ...(current as CreateEntityAction),
                    selection: {
                      ...(current as CreateEntityAction).selection,
                      existingId: event.target.value || undefined
                    }
                  }))
                }
              >
                <option value="">Select existing</option>
                {action.existingMatches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      );
    }

    if (action.kind === "UPDATE_ENTITY") {
      return (
        <div className="agent-inline-fields">
          <label>
            Target Type
            <select
              value={action.entityType}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as UpdateEntityAction),
                  entityType: event.target.value as NarrativeEntityType
                }))
              }
            >
              {entityTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target Name
            <input
              value={action.targetName}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as UpdateEntityAction),
                  targetName: event.target.value
                }))
              }
            />
          </label>
          <label>
            Target Record
            <select
              value={action.selectedTargetId || ""}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as UpdateEntityAction),
                  selectedTargetId: event.target.value || undefined
                }))
              }
            >
              <option value="">Select target</option>
              {action.targetMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    }

    if (action.kind === "ADD_CONTACT") {
      return (
        <div className="agent-inline-fields">
          <label>
            Parent
            <input
              value={action.parentName}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as AddContactAction),
                  parentName: event.target.value
                }))
              }
            />
          </label>
          <label>
            Contact Name
            <input
              value={action.contact.name}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as AddContactAction),
                  contact: {
                    ...(current as AddContactAction).contact,
                    name: event.target.value
                  }
                }))
              }
            />
          </label>
          <label>
            Parent Record
            <select
              value={action.selectedParentId || ""}
              onChange={(event) =>
                updatePlanAction(action.id, (current) => ({
                  ...(current as AddContactAction),
                  selectedParentId: event.target.value || undefined
                }))
              }
            >
              <option value="">Select parent</option>
              {action.parentMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    }

    return (
      <div className="agent-inline-fields">
        <label>
          Company
          <input
            value={action.companyName}
            onChange={(event) =>
              updatePlanAction(action.id, (current) => ({
                ...(current as LinkCompanyCoInvestorAction),
                companyName: event.target.value
              }))
            }
          />
        </label>
        <label>
          Co-Investor
          <input
            value={action.coInvestorName}
            onChange={(event) =>
              updatePlanAction(action.id, (current) => ({
                ...(current as LinkCompanyCoInvestorAction),
                coInvestorName: event.target.value
              }))
            }
          />
        </label>
        <label>
          Company Record
          <select
            value={action.selectedCompanyId || ""}
            onChange={(event) =>
              updatePlanAction(action.id, (current) => ({
                ...(current as LinkCompanyCoInvestorAction),
                selectedCompanyId: event.target.value || undefined
              }))
            }
          >
            <option value="">Select company</option>
            {action.companyMatches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Co-Investor Record
          <select
            value={action.selectedCoInvestorId || ""}
            onChange={(event) =>
              updatePlanAction(action.id, (current) => ({
                ...(current as LinkCompanyCoInvestorAction),
                selectedCoInvestorId: event.target.value || undefined
              }))
            }
          >
            <option value="">Select co-investor</option>
            {action.coInvestorMatches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  const blockingIssues = useMemo(() => {
    if (!plan) return [];
    const issues: string[] = [];
    for (const action of plan.actions) {
      if (!action.include) continue;
      for (const issue of actionValidationById.get(action.id) || []) {
        issues.push(`${actionLabel(action)}: ${issue}`);
      }
    }
    return issues;
  }, [plan, actionValidationById]);

  function openExecutionModal(preferredActionId?: string) {
    if (!plan) {
      setError("No execution plan available.");
      return;
    }

    const targetId = preferredActionId || nextRunnableActionId || wizardActionIds[0];
    const targetIndex = targetId ? Math.max(0, wizardActionIds.indexOf(targetId)) : 0;
    setError(null);
    setWizardIndex(targetIndex);
    setWizardOpen(true);
  }

  function closeExecutionModal() {
    setWizardOpen(false);
    setWizardIndex(0);
  }

  function moveWizardStep(offset: number) {
    if (wizardActionIds.length === 0) return;
    setWizardIndex((current) => {
      const next = current + offset;
      if (next < 0) return 0;
      if (next >= wizardActionIds.length) return wizardActionIds.length - 1;
      return next;
    });
  }

  function applyCreateResolutionFromResults(results: NarrativeExecutionResult[]) {
    const createResults = results.filter(
      (result) => result.kind === "CREATE_ENTITY" && result.status === "EXECUTED" && result.record?.id
    );
    if (createResults.length === 0) return;

    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions.map((action) => {
          let nextAction = action;
          for (const result of createResults) {
            const createdId = result.record?.id;
            if (!createdId) continue;

            if (
              nextAction.kind === "UPDATE_ENTITY" &&
              nextAction.linkedCreateActionId === result.actionId &&
              !nextAction.selectedTargetId
            ) {
              nextAction = {
                ...nextAction,
                selectedTargetId: createdId
              };
            }

            if (
              nextAction.kind === "ADD_CONTACT" &&
              nextAction.linkedCreateActionId === result.actionId &&
              !nextAction.selectedParentId
            ) {
              nextAction = {
                ...nextAction,
                selectedParentId: createdId
              };
            }

            if (
              nextAction.kind === "LINK_COMPANY_CO_INVESTOR" &&
              nextAction.companyCreateActionId === result.actionId &&
              !nextAction.selectedCompanyId
            ) {
              nextAction = {
                ...nextAction,
                selectedCompanyId: createdId
              };
            }

            if (
              nextAction.kind === "LINK_COMPANY_CO_INVESTOR" &&
              nextAction.coInvestorCreateActionId === result.actionId &&
              !nextAction.selectedCoInvestorId
            ) {
              nextAction = {
                ...nextAction,
                selectedCoInvestorId: createdId
              };
            }
          }
          return nextAction;
        })
      };
    });
  }

  async function executeActionSubset(
    actionIds: string[],
    runLabel: string
  ): Promise<NarrativeExecutionResult[] | null> {
    if (!plan) {
      setError("No execution plan available.");
      return null;
    }
    if (actionIds.length === 0) {
      setError("No plan steps were selected for execution.");
      return null;
    }

    const allowedIds = new Set(actionIds);
    const runPlan: NarrativePlan = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        include: action.include && allowedIds.has(action.id)
      }))
    };

    setExecuting(true);
    setError(null);
    setStatus(runLabel);

    try {
      const response = await fetch("/api/workbench/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: runPlan })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to execute plan");
      }

      const parsed = workbenchExecuteResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Execution payload is invalid.");
      }

      const nonSkipped = parsed.data.results.filter((result) => result.status !== "SKIPPED");

      setResultByActionId((current) => {
        const next = { ...current };
        for (const result of nonSkipped) {
          next[result.actionId] = result;
        }
        return next;
      });
      setCompletedActionIds((current) => {
        const executedIds = nonSkipped
          .filter((result) => result.status === "EXECUTED")
          .map((result) => result.actionId);
        return Array.from(new Set([...current, ...executedIds]));
      });
      applyCreateResolutionFromResults(nonSkipped);

      setExecutionReport(parsed.data);
      setStatus(parsed.data.summary);
      appendMessage({
        role: "assistant",
        kind: "result",
        text: `${parsed.data.summary} Executed: ${parsed.data.executed}, Failed: ${parsed.data.failed}, Skipped: ${parsed.data.skipped}.`
      });
      return nonSkipped;
    } catch (requestError) {
      const messageText =
        requestError instanceof Error ? requestError.message : "Failed to execute plan";
      setError(messageText);
      setStatus(null);
      appendMessage({
        role: "assistant",
        kind: "error",
        text: messageText
      });
      return null;
    } finally {
      setExecuting(false);
    }
  }

  async function executeCurrentWizardStep() {
    if (!wizardAction) {
      setError("No wizard step is selected.");
      return;
    }
    if (!wizardCanExecuteCurrent) {
      setError(
        "This step is not runnable yet. Resolve its issues and complete prerequisite steps first."
      );
      return;
    }

    const response = await executeActionSubset(
      [wizardAction.id],
      `Executing step ${wizardIndex + 1} of ${wizardActionIds.length}: ${actionLabel(wizardAction)}`
    );
    if (!response) return;

    const nextIndex = wizardActionIds.findIndex((id, index) => {
      if (index <= wizardIndex) return false;
      const step = actionById.get(id);
      if (!step || !step.include) return false;
      return !completedSet.has(id);
    });
    if (nextIndex >= 0) {
      setWizardIndex(nextIndex);
    }
  }

  async function executeRemainingWizardSteps() {
    if (!plan) {
      setError("No execution plan available.");
      return;
    }

    const remainingIds = executionOrder.filter((actionId) => {
      const action = actionById.get(actionId);
      if (!action || !action.include) return false;
      if (completedSet.has(actionId)) return false;
      return (actionValidationById.get(actionId) || []).length === 0;
    });

    if (remainingIds.length === 0) {
      setError("No remaining runnable steps. Resolve issues or include steps before running.");
      return;
    }

    await executeActionSubset(
      remainingIds,
      `Executing ${remainingIds.length} remaining step${
        remainingIds.length === 1 ? "" : "s"
      } in dependency order...`
    );
  }

  async function onSubmitMessage() {
    const nextMessage = message.trim();
    if (!nextMessage) {
      setError("Message is required.");
      return;
    }

    setMessage("");
    setError(null);
    appendMessage({
      role: "user",
      kind: "text",
      text: nextMessage
    });

    if (draft && currentQuestion) {
      const answer: WorkbenchClarificationAnswer = {
        questionId: currentQuestion.id,
        question: currentQuestion.question,
        answer: nextMessage
      };
      const nextAnswers = [...clarificationAnswers, answer];
      const nextIndex = questionIndex + 1;
      setClarificationAnswers(nextAnswers);
      setQuestionIndex(nextIndex);

      const nextQuestion = draft.clarifications[nextIndex];
      if (nextQuestion) {
        appendMessage({
          role: "assistant",
          kind: "text",
          text: `Clarification ${nextIndex + 1} of ${draft.clarifications.length}: ${nextQuestion.question}`
        });
      } else {
        appendMessage({
          role: "assistant",
          kind: "text",
          text:
            "All clarifications are captured locally. Type 'Build execution plan' or use the button below."
        });
        setStatus("Clarifications complete. Ready to build plan.");
      }
      return;
    }

    if (draft && !plan) {
      if (buildPhraseForPlanIntent(nextMessage) || allQuestionsAnswered) {
        await finalizePlan();
        return;
      }

      setBaseConversation((current) => (current ? `${current}\nStakeholder: ${nextMessage}` : nextMessage));
      appendMessage({
        role: "assistant",
        kind: "text",
        text:
          "Captured. I can incorporate that context when you ask me to build the execution plan."
      });
      return;
    }

    await runIntake(nextMessage);
  }

  return (
    <main>
      <section className="panel chatbot-shell">
        <div className="chatbot-header">
          <div>
            <h2>Workbench Chat</h2>
            <p className="muted">
              I will gather requirements, propose plan steps, then execute selected steps safely.
            </p>
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={resetAll} disabled={analyzing || executing}>
              Reset
            </button>
          </div>
        </div>

        <div className="chatbot-thread">
          {chatMessages.map((chatMessage) => (
            <article
              key={chatMessage.id}
              className={`chatbot-message ${chatMessage.role === "assistant" ? "assistant" : "user"}`}
            >
              <p>{chatMessage.text}</p>
            </article>
          ))}
          {status ? <p className="chatbot-inline-status status ok">{status}</p> : null}
          {error ? <p className="chatbot-inline-status status error">{error}</p> : null}
        </div>

        {draft && !plan ? (
          <section className="detail-section">
            <p className="detail-label">Draft Operations</p>
            <p className="muted">
              Candidate steps: <strong>{draft.operations.length}</strong> | Clarifications:{" "}
              <strong>
                {Math.min(questionIndex, draft.clarifications.length)}/{draft.clarifications.length}
              </strong>
            </p>
            {draft.operations.length > 0 ? (
              <ol className="agent-step-list">
                {draft.operations.map((action) => (
                  <li key={action.id} className="agent-step-item">
                    {actionLabel(action)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No draft steps extracted yet.</p>
            )}
            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => void finalizePlan()}
                disabled={analyzing || Boolean(currentQuestion)}
              >
                Build Execution Plan
              </button>
            </div>
          </section>
        ) : null}

        {plan ? (
          <section className="detail-section">
            <p className="detail-label">Execution Plan</p>
            <p>{plan.summary || "Execution plan ready."}</p>

            <div className="agent-plan-list">
              {plan.actions.map((action, index) => {
                const runtimeIssues = actionValidationById.get(action.id) || [];
                const combinedIssues = Array.from(new Set([...action.issues, ...runtimeIssues]));
                return (
                  <div key={action.id} className="agent-plan-item">
                    <div className="agent-plan-item-main">
                      <label className="agent-action-toggle">
                        <input
                          type="checkbox"
                          checked={action.include}
                          onChange={(event) =>
                            updatePlanAction(action.id, (current) => ({
                              ...current,
                              include: event.target.checked
                            }))
                          }
                        />
                        <span className="agent-plan-item-index">{index + 1}.</span>
                        <span>{actionLabel(action)}</span>
                      </label>

                      {renderActionEditor(action)}

                      {combinedIssues.length > 0 ? (
                        <ul className="agent-issues">
                          {combinedIssues.map((issue, issueIndex) => (
                            <li key={`${issue}-${issueIndex}`}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="agent-plan-item-actions">
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => deletePlanAction(action.id)}
                        disabled={executing}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="actions">
              <select
                value={newActionKind}
                onChange={(event) => setNewActionKind(event.target.value as NarrativeAction["kind"])}
                disabled={analyzing || executing}
              >
                {actionKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary"
                onClick={() => addPlanAction(newActionKind)}
                disabled={analyzing || executing}
              >
                Add Step
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => openExecutionModal()}
                disabled={analyzing || executing}
              >
                Edit Steps
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => openExecutionModal(nextRunnableActionId || undefined)}
                disabled={analyzing || executing || plan.actions.length === 0}
              >
                Accept And Run Plan
              </button>
            </div>

            <p className="muted">
              Selected: <strong>{selectedCount}</strong> | Executed: <strong>{executionCounts.executed}</strong> |
              Failed: <strong>{executionCounts.failed}</strong>
            </p>

            {blockingIssues.length > 0 ? (
              <div className="chatbot-plan-issues">
                <p className="detail-label">Resolve Before Running</p>
                <ul className="agent-validation-list">
                  {blockingIssues.map((issue, index) => (
                    <li key={`${issue}-${index}`}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {executionResults.length > 0 || executionReport ? (
          <section className="detail-section">
            <p className="detail-label">Execution Report</p>
            <p>
              Executed: <strong>{executionCounts.executed}</strong> | Failed:{" "}
              <strong>{executionCounts.failed}</strong> | Skipped: <strong>{executionCounts.skipped}</strong>
            </p>
            <ul className="agent-list">
              {(executionResults.length > 0 ? executionResults : executionReport?.results || []).map(
                (result: NarrativeExecutionResult) => (
                <li key={result.actionId} className={`agent-result ${result.status.toLowerCase()}`}>
                  <strong>{result.status}</strong> {result.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {wizardOpen ? (
          <div className="agent-wizard-backdrop">
            <section className="agent-wizard-modal" role="dialog" aria-modal="true" aria-label="Execution Wizard">
              <header className="agent-wizard-header">
                <div>
                  <h3 className="agent-wizard-title">Execution Wizard</h3>
                  <p className="muted">
                    Step {wizardActionIds.length === 0 ? 0 : wizardIndex + 1} of {wizardActionIds.length}
                  </p>
                </div>
                <div className="agent-wizard-header-actions">
                  <button type="button" className="ghost" onClick={closeExecutionModal} disabled={executing}>
                    Close
                  </button>
                </div>
              </header>

              <div className="agent-wizard-progress-track" aria-hidden>
                <div
                  className="agent-wizard-progress-indicator"
                  style={{ width: `${Math.max(0, Math.min(100, wizardProgressPercent))}%` }}
                />
              </div>

              <div className="agent-wizard-body">
                {wizardAction ? (
                  <div
                    className={`agent-plan-item ${wizardAction.id === nextRunnableActionId ? "current" : ""}`}
                  >
                    <div className="agent-plan-item-main">
                      <label className="agent-action-toggle">
                        <input
                          type="checkbox"
                          checked={wizardAction.include}
                          onChange={(event) =>
                            updatePlanAction(wizardAction.id, (current) => ({
                              ...current,
                              include: event.target.checked
                            }))
                          }
                          disabled={executing}
                        />
                        <span className="agent-plan-item-index">{wizardIndex + 1}.</span>
                        <span>{actionLabel(wizardAction)}</span>
                      </label>

                      {wizardDependencyLabels.length > 0 ? (
                        <p className="muted">Depends on: {wizardDependencyLabels.join(", ")}</p>
                      ) : null}
                      {wizardResult ? (
                        <p className={`status ${wizardResult.status === "FAILED" ? "error" : "ok"}`}>
                          {wizardResult.status}: {wizardResult.message}
                        </p>
                      ) : null}

                      {renderActionEditor(wizardAction)}

                      {wizardCombinedIssues.length > 0 ? (
                        <ul className="agent-issues">
                          {wizardCombinedIssues.map((issue, issueIndex) => (
                            <li key={`${issue}-${issueIndex}`}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="muted">No plan steps are available.</p>
                )}
              </div>

              <footer className="agent-wizard-footer">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => moveWizardStep(-1)}
                  disabled={executing || wizardIndex <= 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => moveWizardStep(1)}
                  disabled={executing || wizardIndex >= Math.max(0, wizardActionIds.length - 1)}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void executeCurrentWizardStep()}
                  disabled={executing || !wizardCanExecuteCurrent}
                >
                  {executing ? "Executing..." : "Run Current Step"}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void executeRemainingWizardSteps()}
                  disabled={executing || selectedCount === 0}
                >
                  {executing ? "Executing..." : "Run Remaining Steps"}
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        <form
          className="chatbot-input-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmitMessage();
          }}
        >
          <label>
            Message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="chatbot-input"
              placeholder="Example: MemorialCare Health System introduced us to Vitalize Care. Co-investors include Oak and Norwest."
            />
          </label>
          <div className="actions">
            <button
              type="submit"
              className="primary"
              disabled={analyzing || executing || !message.trim()}
            >
              {analyzing ? "Thinking..." : "Send"}
            </button>
            {draft && !plan ? (
              <button
                type="button"
                className="secondary"
                onClick={() => void finalizePlan()}
                disabled={analyzing || executing || Boolean(currentQuestion)}
              >
                Build Execution Plan
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
