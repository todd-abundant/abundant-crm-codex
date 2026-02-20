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
  type UpdateEntityAction,
  narrativePlanSchema
} from "@/lib/narrative-agent-types";

type ExecutionReport = {
  summary: string;
  executed: number;
  failed: number;
  skipped: number;
  results: NarrativeExecutionResult[];
  createdEntities: Array<{
    entityType: NarrativeEntityType;
    id: string;
    name: string;
    created: boolean;
  }>;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  kind: "text" | "plan" | "result" | "error";
  text: string;
  planSnapshot?: NarrativePlan;
};

const entityTypeOptions: Array<{ value: NarrativeEntityType; label: string }> = [
  { value: "HEALTH_SYSTEM", label: "Health System" },
  { value: "COMPANY", label: "Company" },
  { value: "CO_INVESTOR", label: "Co-Investor" }
];

const contactRoleOptions: Array<{
  value: "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER";
  label: string;
}> = [
  { value: "EXECUTIVE", label: "Executive" },
  { value: "VENTURE_PARTNER", label: "Venture Partner" },
  { value: "INVESTOR_PARTNER", label: "Investor Partner" },
  { value: "COMPANY_CONTACT", label: "Company Contact" },
  { value: "OTHER", label: "Other" }
];

function entityTypeLabel(entityType: NarrativeEntityType) {
  return entityTypeOptions.find((entry) => entry.value === entityType)?.label || entityType;
}

function formatConfidence(confidence?: number) {
  if (confidence === undefined || confidence === null) return "";
  return `${Math.round(confidence * 100)}% confidence`;
}

function formatLocation(item: {
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
}) {
  return [item.headquartersCity, item.headquartersState, item.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function formatAmount(value?: number | null) {
  if (value === null || value === undefined) return "";
  return String(value);
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

function actionLabel(action: NarrativeAction) {
  if (action.kind === "CREATE_ENTITY") {
    return `Create ${entityTypeLabel(action.entityType)}: ${action.draft.name}`;
  }
  if (action.kind === "UPDATE_ENTITY") {
    return `Update ${entityTypeLabel(action.entityType)}: ${action.targetName}`;
  }
  if (action.kind === "ADD_CONTACT") {
    return `Add Contact (${action.contact.name}) to ${action.parentName}`;
  }
  return `Link ${action.companyName} ↔ ${action.coInvestorName}`;
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
    const unresolvedIds = includedActions
      .map((action) => action.id)
      .filter((id) => !orderedIds.includes(id))
      .sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));
    orderedIds.push(...unresolvedIds);
  }

  return orderedIds;
}

function generateActionId(kind: NarrativeAction["kind"]) {
  const kindPrefix = kind.toLowerCase().replace(/_/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${kindPrefix}-${Date.now()}-${random}`;
}

function buildDefaultAction(kind: NarrativeAction["kind"]): NarrativeAction {
  const id = generateActionId(kind);

  if (kind === "CREATE_ENTITY") {
    return {
      id,
      include: true,
      kind: "CREATE_ENTITY",
      entityType: "HEALTH_SYSTEM",
      draft: {
        name: "",
        legalName: "",
        website: "",
        headquartersCity: "",
        headquartersState: "",
        headquartersCountry: "",
        researchNotes: ""
      },
      existingMatches: [],
      webCandidates: [],
      selection: {
        mode: "CREATE_MANUAL"
      },
      issues: []
    };
  }

  if (kind === "UPDATE_ENTITY") {
    return {
      id,
      include: true,
      kind: "UPDATE_ENTITY",
      entityType: "HEALTH_SYSTEM",
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
      parentType: "HEALTH_SYSTEM",
      parentName: "",
      roleType: "EXECUTIVE",
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

function createChatMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizePlanForChat(plan: NarrativePlan) {
  return `I drafted ${plan.actions.length} plan step${
    plan.actions.length === 1 ? "" : "s"
  }. Review it below, then continue iterating or accept and run.`;
}

export function NarrativeAgentWorkbench() {
  const [narrative, setNarrative] = useState("");
  const [userTurns, setUserTurns] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      kind: "text",
      text: "Describe the changes you want. I will draft an execution plan, then you can iterate or accept and run it."
    }
  ]);
  const [plan, setPlan] = useState<NarrativePlan | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultByActionId, setResultByActionId] = useState<Record<string, NarrativeExecutionResult>>({});
  const [completedActionIds, setCompletedActionIds] = useState<string[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIndex, setWizardIndex] = useState(0);

  const selectedCount = useMemo(() => {
    if (!plan) return 0;
    return plan.actions.filter((action) => action.include).length;
  }, [plan]);

  const actionById = useMemo(() => {
    if (!plan) return new Map<string, NarrativeAction>();
    return new Map(plan.actions.map((action) => [action.id, action]));
  }, [plan]);

  const executionOrder = useMemo(() => {
    if (!plan) return [];
    return buildExecutionOrder(plan.actions);
  }, [plan]);

  const wizardActionIds = useMemo(() => {
    if (!plan) return [];
    return plan.actions.map((action) => action.id);
  }, [plan]);

  const wizardActionId = wizardActionIds[wizardIndex] || null;
  const wizardAction = wizardActionId ? actionById.get(wizardActionId) || null : null;
  const wizardProgressPercent =
    wizardActionIds.length === 0 ? 0 : Math.round(((wizardIndex + 1) / wizardActionIds.length) * 100);

  const completedActionIdSet = useMemo(
    () => new Set(completedActionIds),
    [completedActionIds]
  );

  const actionValidationById = useMemo(() => {
    const validation = new Map<string, string[]>();
    if (!plan) return validation;

    for (const action of plan.actions) {
      const issues: string[] = [];
      if (!action.include) {
        validation.set(action.id, issues);
        continue;
      }

      if (action.kind === "CREATE_ENTITY") {
        if (action.selection.mode === "USE_EXISTING") {
          const hasExistingSelection = Boolean(
            action.selection.existingId || action.existingMatches[0]?.id
          );
          if (!hasExistingSelection) {
            issues.push("Select an existing record or switch to another resolution mode.");
          }
        }

        if (action.selection.mode === "CREATE_FROM_WEB") {
          if (action.webCandidates.length === 0) {
            issues.push("No web candidates found. Use manual create or existing record.");
          } else if (
            action.webCandidates.length > 1 &&
            action.selection.webCandidateIndex === undefined
          ) {
            issues.push("Multiple web candidates found. Choose one before execution.");
          }
        }

        if (!action.draft.name.trim()) {
          issues.push("Create action requires a name.");
        }
      }

      const dependencyIds = getActionDependencyIds(action);
      for (const dependencyId of dependencyIds) {
        const dependencyAction = plan.actions.find((entry) => entry.id === dependencyId);
        if (dependencyAction && !dependencyAction.include) {
          issues.push(`Dependency not selected: ${actionLabel(dependencyAction)}.`);
        }
      }

      validation.set(action.id, issues);
    }

    return validation;
  }, [plan]);

  const blockingMessages = useMemo(() => {
    if (!plan) return [];
    const messages: string[] = [];

    for (const action of plan.actions) {
      if (!action.include) continue;
      const actionIssues = actionValidationById.get(action.id) || [];
      for (const issue of actionIssues) {
        messages.push(`${actionLabel(action)}: ${issue}`);
      }
    }

    return messages;
  }, [plan, actionValidationById]);

  const nextRunnableActionId = useMemo(() => {
    if (!plan) return null;

    for (const actionId of executionOrder) {
      const action = actionById.get(actionId);
      if (!action || !action.include) continue;
      if (completedActionIdSet.has(actionId)) continue;
      if ((actionValidationById.get(actionId) || []).length > 0) continue;

      const dependencies = getActionDependencyIds(action).filter((dependencyId) => {
        const dependencyAction = actionById.get(dependencyId);
        return Boolean(dependencyAction?.include);
      });

      const allDependenciesSatisfied = dependencies.every((dependencyId) =>
        completedActionIdSet.has(dependencyId)
      );
      if (allDependenciesSatisfied) {
        return actionId;
      }
    }

    return null;
  }, [plan, executionOrder, actionById, actionValidationById, completedActionIdSet]);

  const wizardCurrentIssues = useMemo(() => {
    if (!wizardAction) return [];
    return actionValidationById.get(wizardAction.id) || [];
  }, [wizardAction, actionValidationById]);

  const wizardCanExecuteCurrent = useMemo(() => {
    if (!wizardAction || !wizardAction.include) return false;
    if (wizardCurrentIssues.length > 0) return false;
    return wizardAction.id === nextRunnableActionId;
  }, [wizardAction, wizardCurrentIssues, nextRunnableActionId]);

  const executionResults = useMemo(() => {
    if (!plan) return [];
    return plan.actions
      .map((action) => resultByActionId[action.id])
      .filter((entry): entry is NarrativeExecutionResult => Boolean(entry));
  }, [plan, resultByActionId]);

  const createActionOptions = useMemo(() => {
    if (!plan) return [] as Array<{
      id: string;
      entityType: NarrativeEntityType;
      label: string;
    }>;

    return plan.actions
      .filter((action): action is CreateEntityAction => action.kind === "CREATE_ENTITY")
      .map((action) => ({
        id: action.id,
        entityType: action.entityType,
        label: actionLabel(action)
      }));
  }, [plan]);

  const executionCounts = useMemo(() => {
    const executed = executionResults.filter((entry) => entry.status === "EXECUTED").length;
    const failed = executionResults.filter((entry) => entry.status === "FAILED").length;
    const skipped = executionResults.filter((entry) => entry.status === "SKIPPED").length;
    return { executed, failed, skipped };
  }, [executionResults]);

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

  function appendChatMessage(message: Omit<ChatMessage, "id">) {
    setChatMessages((current) => [
      ...current,
      {
        ...message,
        id: createChatMessageId(message.role)
      }
    ]);
  }

  function resetWorkbenchState() {
    setPlan(null);
    setUserTurns([]);
    setResultByActionId({});
    setCompletedActionIds([]);
    setWizardOpen(false);
    setWizardIndex(0);
    setStatus(null);
    setError(null);
    setNarrative("");
    setChatMessages([
      {
        id: "assistant-welcome",
        role: "assistant",
        kind: "text",
        text: "Describe the changes you want. I will draft an execution plan, then you can iterate or accept and run it."
      }
    ]);
  }

  function updateAction(actionId: string, updater: (action: NarrativeAction) => NarrativeAction) {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions.map((action) =>
          action.id === actionId ? updater(action) : action
        )
      };
    });
  }

  function updateCreateAction(
    actionId: string,
    updater: (action: CreateEntityAction) => CreateEntityAction
  ) {
    updateAction(actionId, (action) => {
      if (action.kind !== "CREATE_ENTITY") return action;
      return updater(action);
    });
  }

  function updateUpdateAction(
    actionId: string,
    updater: (action: UpdateEntityAction) => UpdateEntityAction
  ) {
    updateAction(actionId, (action) => {
      if (action.kind !== "UPDATE_ENTITY") return action;
      return updater(action);
    });
  }

  function updateContactAction(
    actionId: string,
    updater: (action: AddContactAction) => AddContactAction
  ) {
    updateAction(actionId, (action) => {
      if (action.kind !== "ADD_CONTACT") return action;
      return updater(action);
    });
  }

  function updateLinkAction(
    actionId: string,
    updater: (action: LinkCompanyCoInvestorAction) => LinkCompanyCoInvestorAction
  ) {
    updateAction(actionId, (action) => {
      if (action.kind !== "LINK_COMPANY_CO_INVESTOR") return action;
      return updater(action);
    });
  }

  function addPlanAction(kind: NarrativeAction["kind"]) {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: [...current.actions, buildDefaultAction(kind)]
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

  function openPlanWizard(targetActionId?: string) {
    if (!plan || plan.actions.length === 0) {
      setError("Analyze a narrative and create at least one plan item first.");
      return;
    }

    const requestedIndex = targetActionId
      ? plan.actions.findIndex((action) => action.id === targetActionId)
      : 0;
    const nextIndex = requestedIndex >= 0 ? requestedIndex : 0;

    setError(null);
    setWizardIndex(nextIndex);
    setWizardOpen(true);
  }

  function closePlanWizard() {
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

  async function analyzeNarrative() {
    if (!narrative.trim()) {
      setError("Narrative input is required.");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setStatus("Analyzing narrative and extracting actions...");
    setResultByActionId({});
    setCompletedActionIds([]);

    try {
      const response = await fetch("/api/narrative-agent/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ narrative })
      });

      const payload = (await response.json()) as {
        plan?: unknown;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to analyze narrative");
      }

      const parsed = narrativePlanSchema.safeParse(payload.plan);
      if (!parsed.success) {
        throw new Error("Received an invalid narrative plan.");
      }

      setPlan(parsed.data);
      setResultByActionId({});
      setCompletedActionIds([]);
      setWizardOpen(false);
      setWizardIndex(0);
      setStatus(
        `Extracted ${parsed.data.actions.length} action${
          parsed.data.actions.length === 1 ? "" : "s"
        }.`
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to analyze narrative"
      );
      setStatus(null);
      setPlan(null);
      setResultByActionId({});
      setCompletedActionIds([]);
      setWizardOpen(false);
      setWizardIndex(0);
    } finally {
      setAnalyzing(false);
    }
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

  async function executeActionSubset(actionIds: string[], runLabel: string) {
    if (!plan) {
      setError("Analyze a narrative before executing actions.");
      return;
    }

    if (actionIds.length === 0) {
      setError("No actions selected for execution.");
      return;
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
      const response = await fetch("/api/narrative-agent/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ plan: runPlan })
      });

      const payload = (await response.json()) as
        | (ExecutionReport & { error?: never })
        | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "Execution failed" : "Execution failed");
      }

      const nextReport = payload as ExecutionReport;
      const nonSkipped = nextReport.results.filter((result) => result.status !== "SKIPPED");

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
      setStatus(nextReport.summary || "Execution complete.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to execute narrative plan"
      );
      setStatus(null);
    } finally {
      setExecuting(false);
    }
  }

  async function executeRemainingPlan() {
    if (!plan) {
      setError("Analyze a narrative before executing actions.");
      return;
    }

    const remainingIds = executionOrder.filter((actionId) => {
      const action = actionById.get(actionId);
      if (!action || !action.include) return false;
      if (completedActionIdSet.has(actionId)) return false;
      return (actionValidationById.get(actionId) || []).length === 0;
    });

    if (remainingIds.length === 0) {
      setError("No remaining runnable actions. Resolve issues or uncheck completed items.");
      return;
    }

    await executeActionSubset(
      remainingIds,
      `Walking through ${remainingIds.length} plan step${remainingIds.length === 1 ? "" : "s"} in order...`
    );
  }

  async function executeCurrentWizardStep() {
    if (!wizardAction) {
      setError("No wizard step selected.");
      return;
    }

    if (!wizardCanExecuteCurrent) {
      setError(
        "This step is not runnable yet. Resolve its issues and complete any prerequisite actions first."
      );
      return;
    }

    await executeActionSubset(
      [wizardAction.id],
      `Executing step ${wizardIndex + 1} of ${wizardActionIds.length}: ${actionLabel(wizardAction)}`
    );
  }

  function renderWizardActionEditor(action: NarrativeAction) {
    const runtimeIssues = actionValidationById.get(action.id) || [];
    const combinedIssues = Array.from(new Set([...action.issues, ...runtimeIssues]));
    const actionResult = resultByActionId[action.id];
    const dependencyActions = getActionDependencyIds(action)
      .map((dependencyId) => actionById.get(dependencyId))
      .filter((dependency): dependency is NarrativeAction => Boolean(dependency));

    if (action.kind === "CREATE_ENTITY") {
      return (
        <section className="agent-action-card agent-action-card-wizard">
          <div className="agent-action-header">
            <label className="agent-action-toggle">
              <input
                type="checkbox"
                checked={action.include}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    include: event.target.checked
                  }))
                }
              />
              <strong>Create {entityTypeLabel(action.entityType)}</strong>
            </label>
            <span className="muted">{formatConfidence(action.confidence)}</span>
          </div>

          {actionResult ? (
            <p className={`status ${actionResult.status === "FAILED" ? "error" : "ok"}`}>
              {actionResult.status}: {actionResult.message}
            </p>
          ) : null}

          {action.rationale ? <p className="muted">{action.rationale}</p> : null}

          <div className="row">
            <label>
              Entity Type
              <select
                value={action.entityType}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
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
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      name: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="row">
            <label>
              Legal Name
              <input
                value={action.draft.legalName || ""}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      legalName: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              Website
              <input
                value={action.draft.website || ""}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      website: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="row-3">
            <label>
              HQ City
              <input
                value={action.draft.headquartersCity || ""}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      headquartersCity: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              HQ State
              <input
                value={action.draft.headquartersState || ""}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      headquartersState: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              HQ Country
              <input
                value={action.draft.headquartersCountry || ""}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      headquartersCountry: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="row">
            <label>
              Resolution Mode
              <select
                value={action.selection.mode}
                onChange={(event) =>
                  updateCreateAction(action.id, (current) => ({
                    ...current,
                    selection: {
                      ...current.selection,
                      mode: event.target.value as "CREATE_FROM_WEB" | "CREATE_MANUAL" | "USE_EXISTING"
                    }
                  }))
                }
              >
                <option value="USE_EXISTING">Use existing record</option>
                <option value="CREATE_FROM_WEB">Create from web candidate</option>
                <option value="CREATE_MANUAL">Create manual record</option>
              </select>
            </label>

            {action.selection.mode === "USE_EXISTING" ? (
              <label>
                Existing Match
                <select
                  value={action.selection.existingId || ""}
                  onChange={(event) =>
                    updateCreateAction(action.id, (current) => ({
                      ...current,
                      selection: {
                        ...current.selection,
                        existingId: event.target.value || undefined
                      }
                    }))
                  }
                >
                  <option value="">Select existing record</option>
                  {action.existingMatches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {match.name} ({Math.round((match.confidence || 0) * 100)}%)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {action.selection.mode === "CREATE_FROM_WEB" ? (
            <div className="agent-candidate-picker">
              <p className="detail-label">Web Candidate</p>
              {action.webCandidates.length === 0 ? (
                <p className="status error">
                  No web candidates are available. Switch to manual create or use existing.
                </p>
              ) : (
                <div className="agent-candidate-list">
                  {action.webCandidates.map((candidate, index) => {
                    const selected = action.selection.webCandidateIndex === index;
                    return (
                      <label
                        key={`${candidate.name}-${index}`}
                        className={`agent-candidate-option ${selected ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`wizard-web-candidate-${action.id}`}
                          checked={selected}
                          onChange={() =>
                            updateCreateAction(action.id, (current) => ({
                              ...current,
                              selection: {
                                ...current.selection,
                                webCandidateIndex: index
                              }
                            }))
                          }
                        />
                        <div>
                          <div className="candidate-name">{candidate.name}</div>
                          <div className="candidate-location muted">
                            {formatLocation(candidate) || "Location not identified"}
                          </div>
                          {candidate.website ? (
                            <a href={candidate.website} target="_blank" rel="noreferrer">
                              {candidate.website}
                            </a>
                          ) : null}
                          {candidate.summary ? <p className="muted">{candidate.summary}</p> : null}
                          {candidate.sourceUrls.length > 0 ? (
                            <div className="inline-source-row">
                              {candidate.sourceUrls.slice(0, 3).map((url, sourceIndex) => (
                                <a
                                  key={`${url}-${sourceIndex}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-source-chip"
                                >
                                  Source {sourceIndex + 1}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {combinedIssues.length > 0 ? (
            <ul className="agent-issues">
              {combinedIssues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    }

    if (action.kind === "UPDATE_ENTITY") {
      const compatibleCreateActions = createActionOptions.filter(
        (option) => option.entityType === action.entityType
      );

      return (
        <section className="agent-action-card agent-action-card-wizard">
          <div className="agent-action-header">
            <label className="agent-action-toggle">
              <input
                type="checkbox"
                checked={action.include}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    include: event.target.checked
                  }))
                }
              />
              <strong>Update {entityTypeLabel(action.entityType)}</strong>
            </label>
            <span className="muted">{formatConfidence(action.confidence)}</span>
          </div>

          {actionResult ? (
            <p className={`status ${actionResult.status === "FAILED" ? "error" : "ok"}`}>
              {actionResult.status}: {actionResult.message}
            </p>
          ) : null}

          <div className="row">
            <label>
              Entity Type
              <select
                value={action.entityType}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
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
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    targetName: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="row">
            <label>
              Depends on Create Action
              <select
                value={action.linkedCreateActionId || ""}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    linkedCreateActionId: event.target.value || undefined,
                    selectedTargetId: event.target.value ? undefined : current.selectedTargetId
                  }))
                }
              >
                <option value="">No create dependency</option>
                {compatibleCreateActions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target Record
              <select
                value={action.selectedTargetId || ""}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    selectedTargetId: event.target.value || undefined
                  }))
                }
              >
                <option value="">Resolve at execution</option>
                {action.targetMatches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.name} ({Math.round((match.confidence || 0) * 100)}%)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row-3">
            <label>
              New Name
              <input
                value={action.patch.name || ""}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    patch: {
                      ...current.patch,
                      name: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              Website
              <input
                value={action.patch.website || ""}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    patch: {
                      ...current.patch,
                      website: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              Notes
              <input
                value={action.patch.researchNotes || ""}
                onChange={(event) =>
                  updateUpdateAction(action.id, (current) => ({
                    ...current,
                    patch: {
                      ...current.patch,
                      researchNotes: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          {dependencyActions.length > 0 ? (
            <p className="muted">Depends on: {dependencyActions.map((entry) => actionLabel(entry)).join(", ")}</p>
          ) : null}

          {combinedIssues.length > 0 ? (
            <ul className="agent-issues">
              {combinedIssues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    }

    if (action.kind === "ADD_CONTACT") {
      const compatibleCreateActions = createActionOptions.filter(
        (option) => option.entityType === action.parentType
      );

      return (
        <section className="agent-action-card agent-action-card-wizard">
          <div className="agent-action-header">
            <label className="agent-action-toggle">
              <input
                type="checkbox"
                checked={action.include}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    include: event.target.checked
                  }))
                }
              />
              <strong>Add Contact</strong>
            </label>
            <span className="muted">{formatConfidence(action.confidence)}</span>
          </div>

          {actionResult ? (
            <p className={`status ${actionResult.status === "FAILED" ? "error" : "ok"}`}>
              {actionResult.status}: {actionResult.message}
            </p>
          ) : null}

          <div className="row">
            <label>
              Parent Type
              <select
                value={action.parentType}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    parentType: event.target.value as NarrativeEntityType
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
              Parent Name
              <input
                value={action.parentName}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    parentName: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="row">
            <label>
              Depends on Create Action
              <select
                value={action.linkedCreateActionId || ""}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    linkedCreateActionId: event.target.value || undefined,
                    selectedParentId: event.target.value ? undefined : current.selectedParentId
                  }))
                }
              >
                <option value="">No create dependency</option>
                {compatibleCreateActions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Parent Record
              <select
                value={action.selectedParentId || ""}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    selectedParentId: event.target.value || undefined
                  }))
                }
              >
                <option value="">Resolve at execution</option>
                {action.parentMatches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.name} ({Math.round((match.confidence || 0) * 100)}%)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row-3">
            <label>
              Contact Name
              <input
                value={action.contact.name}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    contact: {
                      ...current.contact,
                      name: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              Role Type
              <select
                value={action.roleType}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    roleType: event.target.value as
                      | "EXECUTIVE"
                      | "VENTURE_PARTNER"
                      | "INVESTOR_PARTNER"
                      | "COMPANY_CONTACT"
                      | "OTHER"
                  }))
                }
              >
                {contactRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                value={action.contact.title || ""}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    contact: {
                      ...current.contact,
                      title: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="row-3">
            <label>
              Email
              <input
                value={action.contact.email || ""}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    contact: {
                      ...current.contact,
                      email: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              Phone
              <input
                value={action.contact.phone || ""}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    contact: {
                      ...current.contact,
                      phone: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label>
              LinkedIn URL
              <input
                value={action.contact.linkedinUrl || ""}
                onChange={(event) =>
                  updateContactAction(action.id, (current) => ({
                    ...current,
                    contact: {
                      ...current.contact,
                      linkedinUrl: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          {dependencyActions.length > 0 ? (
            <p className="muted">Depends on: {dependencyActions.map((entry) => actionLabel(entry)).join(", ")}</p>
          ) : null}

          {combinedIssues.length > 0 ? (
            <ul className="agent-issues">
              {combinedIssues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    }

    const companyCreateActions = createActionOptions.filter((option) => option.entityType === "COMPANY");
    const coInvestorCreateActions = createActionOptions.filter(
      (option) => option.entityType === "CO_INVESTOR"
    );

    return (
      <section className="agent-action-card agent-action-card-wizard">
        <div className="agent-action-header">
          <label className="agent-action-toggle">
            <input
              type="checkbox"
              checked={action.include}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  include: event.target.checked
                }))
              }
            />
            <strong>Link Company + Co-Investor</strong>
          </label>
          <span className="muted">{formatConfidence(action.confidence)}</span>
        </div>

        {actionResult ? (
          <p className={`status ${actionResult.status === "FAILED" ? "error" : "ok"}`}>
            {actionResult.status}: {actionResult.message}
          </p>
        ) : null}

        <div className="row">
          <label>
            Company Name
            <input
              value={action.companyName}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  companyName: event.target.value
                }))
              }
            />
          </label>
          <label>
            Co-Investor Name
            <input
              value={action.coInvestorName}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  coInvestorName: event.target.value
                }))
              }
            />
          </label>
        </div>

        <div className="row">
          <label>
            Company Create Dependency
            <select
              value={action.companyCreateActionId || ""}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  companyCreateActionId: event.target.value || undefined,
                  selectedCompanyId: event.target.value ? undefined : current.selectedCompanyId
                }))
              }
            >
              <option value="">No company create dependency</option>
              {companyCreateActions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Co-Investor Create Dependency
            <select
              value={action.coInvestorCreateActionId || ""}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  coInvestorCreateActionId: event.target.value || undefined,
                  selectedCoInvestorId: event.target.value ? undefined : current.selectedCoInvestorId
                }))
              }
            >
              <option value="">No co-investor create dependency</option>
              {coInvestorCreateActions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label>
            Company Record
            <select
              value={action.selectedCompanyId || ""}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  selectedCompanyId: event.target.value || undefined
                }))
              }
            >
              <option value="">Resolve at execution</option>
              {action.companyMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.name} ({Math.round((match.confidence || 0) * 100)}%)
                </option>
              ))}
            </select>
          </label>
          <label>
            Co-Investor Record
            <select
              value={action.selectedCoInvestorId || ""}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  selectedCoInvestorId: event.target.value || undefined
                }))
              }
            >
              <option value="">Resolve at execution</option>
              {action.coInvestorMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.name} ({Math.round((match.confidence || 0) * 100)}%)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label>
            Relationship Type
            <select
              value={action.relationshipType}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  relationshipType: event.target.value as "INVESTOR" | "PARTNER" | "OTHER"
                }))
              }
            >
              <option value="INVESTOR">Investor</option>
              <option value="PARTNER">Partner</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Investment Amount (USD)
            <input
              value={formatAmount(action.investmentAmountUsd)}
              onChange={(event) =>
                updateLinkAction(action.id, (current) => ({
                  ...current,
                  investmentAmountUsd: parseMoneyInput(event.target.value)
                }))
              }
            />
          </label>
        </div>

        <label>
          Notes
          <input
            value={action.notes || ""}
            onChange={(event) =>
              updateLinkAction(action.id, (current) => ({
                ...current,
                notes: event.target.value
              }))
            }
          />
        </label>

        {dependencyActions.length > 0 ? (
          <p className="muted">Depends on: {dependencyActions.map((entry) => actionLabel(entry)).join(", ")}</p>
        ) : null}

        {combinedIssues.length > 0 ? (
          <ul className="agent-issues">
            {combinedIssues.map((issue, index) => (
              <li key={`${issue}-${index}`}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <main>
      <section className="hero">
        <h1>Workbench</h1>
        <p>
          Paste a meeting transcript or narrative request. The agent proposes add/edit CRM actions,
          lets you update and confirm them, then executes only what you select.
        </p>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Narrative Intake</h2>
          <label>
            Narrative
            <textarea
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
              placeholder="Paste transcript notes or a change request. Example: 'Add Intermountain as a health system, add Jane Doe as VP Strategy contact, and link NewCo with Oak HC/FT as investor.'"
              className="agent-narrative-input"
            />
          </label>

          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={analyzeNarrative}
              disabled={analyzing || executing || !narrative.trim()}
            >
              {analyzing ? "Analyzing..." : "Analyze Narrative"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setPlan(null);
                setResultByActionId({});
                setCompletedActionIds([]);
                setWizardOpen(false);
                setWizardIndex(0);
                setStatus(null);
                setError(null);
              }}
              disabled={analyzing || executing}
            >
              Reset Results
            </button>
          </div>

          {status ? <p className="status ok">{status}</p> : null}
          {error ? <p className="status error">{error}</p> : null}

          {plan ? (
            <div className="detail-section">
              <p className="detail-label">Plan Summary</p>
              <p>{plan.summary || "No summary provided."}</p>
              {plan.warnings.length > 0 ? (
                <>
                  <p className="detail-label">Warnings</p>
                  <ul className="agent-list">
                    {plan.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="muted">
                Selected actions: <strong>{selectedCount}</strong> / {plan.actions.length}
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => openPlanWizard()}
                  disabled={executing}
                >
                  Launch Plan Wizard
                </button>
              </div>
              <p className="detail-label">Plan Items</p>
              <div className="agent-plan-list">
                {plan.actions.map((action, index) => {
                  const runtimeIssues = actionValidationById.get(action.id) || [];
                  const actionResult = resultByActionId[action.id];
                  const isDone = completedActionIdSet.has(action.id);
                  const isCurrentStep = wizardOpen && wizardActionId === action.id;

                  return (
                    <div
                      key={action.id}
                      className={`agent-plan-item ${isCurrentStep ? "current" : ""}`}
                    >
                      <div className="agent-plan-item-main">
                        <label className="agent-action-toggle">
                          <input
                            type="checkbox"
                            checked={action.include}
                            onChange={(event) =>
                              updateAction(action.id, (current) => ({
                                ...current,
                                include: event.target.checked
                              }))
                            }
                          />
                          <span className="agent-plan-item-index">{index + 1}.</span>
                          <span>{actionLabel(action)}</span>
                        </label>
                        {isDone ? <p className="status ok">Completed</p> : null}
                        {runtimeIssues.length > 0 ? (
                          <p className="status error">
                            {runtimeIssues.length} validation issue
                            {runtimeIssues.length === 1 ? "" : "s"}
                          </p>
                        ) : null}
                        {actionResult ? (
                          <p className={`status ${actionResult.status === "FAILED" ? "error" : "ok"}`}>
                            {actionResult.status}: {actionResult.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="agent-plan-item-actions">
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => openPlanWizard(action.id)}
                          disabled={executing}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => deletePlanAction(action.id)}
                          disabled={executing || analyzing}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="detail-label">Add Plan Item</p>
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addPlanAction("CREATE_ENTITY")}
                  disabled={executing}
                >
                  Add Create
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addPlanAction("UPDATE_ENTITY")}
                  disabled={executing}
                >
                  Add Update
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addPlanAction("ADD_CONTACT")}
                  disabled={executing}
                >
                  Add Contact
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addPlanAction("LINK_COMPANY_CO_INVESTOR")}
                  disabled={executing}
                >
                  Add Link
                </button>
              </div>
            </div>
          ) : null}

          {executionResults.length > 0 ? (
            <div className="detail-section">
              <p className="detail-label">Execution Report</p>
              <p>
                Executed: <strong>{executionCounts.executed}</strong> | Failed:{" "}
                <strong>{executionCounts.failed}</strong> | Skipped:{" "}
                <strong>{executionCounts.skipped}</strong>
              </p>
              <ul className="agent-list">
                {executionResults.map((result) => (
                  <li key={result.actionId} className={`agent-result ${result.status.toLowerCase()}`}>
                    <strong>{result.status}</strong> {result.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <h2>Execution Plan</h2>
          {!plan ? (
            <p className="muted">Analyze a narrative to build an execution plan.</p>
          ) : plan.actions.length === 0 ? (
            <p className="muted">No actions were extracted.</p>
          ) : (
            <div className="detail-section">
              <p className="detail-label">Ordered Steps</p>
              {executionOrder.length > 0 ? (
                <ol className="agent-step-list">
                  {executionOrder.map((actionId, index) => {
                    const action = actionById.get(actionId);
                    if (!action) return null;

                    const validationIssues = actionValidationById.get(action.id) || [];
                    const result = resultByActionId[action.id];
                    const isDone = completedActionIdSet.has(action.id);
                    const isReady = nextRunnableActionId === action.id;

                    return (
                      <li
                        key={action.id}
                        className={`agent-step-item ${isDone ? "done" : "pending"} ${!action.include ? "skipped" : ""}`}
                      >
                        <div className="agent-step-line">
                          <span>
                            <strong>{index + 1}.</strong> {actionLabel(action)}
                          </span>
                          {!action.include ? (
                            <span className="status-pill draft">Not Selected</span>
                          ) : result ? (
                            <span
                              className={`status-pill ${
                                result.status === "EXECUTED"
                                  ? "done"
                                  : result.status === "FAILED"
                                    ? "failed"
                                    : "queued"
                              }`}
                            >
                              {result.status}
                            </span>
                          ) : isReady ? (
                            <span className="status-pill running">Ready</span>
                          ) : isDone ? (
                            <span className="status-pill done">Done</span>
                          ) : (
                            <span className="status-pill queued">Queued</span>
                          )}
                        </div>

                        {validationIssues.length > 0 ? (
                          <ul className="agent-issues">
                            {validationIssues.map((issue, issueIndex) => (
                              <li key={`${action.id}-issue-${issueIndex}`}>{issue}</li>
                            ))}
                          </ul>
                        ) : null}

                        {result ? (
                          <p className={`status ${result.status === "FAILED" ? "error" : "ok"}`}>
                            {result.message}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="muted">No steps are currently selected.</p>
              )}

              {blockingMessages.length > 0 ? (
                <>
                  <p className="detail-label">Action Checks</p>
                  <ul className="agent-validation-list">
                    {blockingMessages.map((message, index) => (
                      <li key={`${message}-${index}`}>{message}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  onClick={executeRemainingPlan}
                  disabled={executing || analyzing || selectedCount === 0 || blockingMessages.length > 0}
                >
                  {executing ? "Executing Plan..." : "Execute Plan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {wizardOpen && wizardAction ? (
        <div
          className="agent-wizard-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePlanWizard();
            }
          }}
        >
          <section
            className="agent-wizard-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Plan step wizard"
          >
            <div className="agent-wizard-header">
              <div>
                <p className="detail-label">Plan Wizard</p>
                <h3 className="agent-wizard-title">
                  Step {wizardIndex + 1} of {wizardActionIds.length}
                </h3>
                <p className="muted">{actionLabel(wizardAction)}</p>
              </div>
              <button
                type="button"
                className="secondary small"
                onClick={closePlanWizard}
                disabled={executing}
              >
                Close
              </button>
            </div>

            <div className="agent-wizard-progress-track" aria-hidden="true">
              <div
                className="agent-wizard-progress-indicator"
                style={{ width: `${wizardProgressPercent}%` }}
              />
            </div>

            <div className="agent-wizard-body">{renderWizardActionEditor(wizardAction)}</div>

            {wizardCurrentIssues.length > 0 ? (
              <p className="status error">
                This step has {wizardCurrentIssues.length} validation issue
                {wizardCurrentIssues.length === 1 ? "" : "s"}.
              </p>
            ) : null}

            {!wizardCanExecuteCurrent && wizardAction.include ? (
              <p className="muted">
                This step can be executed when it becomes the next runnable action in dependency order.
              </p>
            ) : null}

            <div className="agent-wizard-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => moveWizardStep(-1)}
                disabled={wizardIndex === 0 || executing}
              >
                Previous
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => deletePlanAction(wizardAction.id)}
                disabled={executing || analyzing}
              >
                Delete Step
              </button>
              <button
                type="button"
                className="primary"
                onClick={executeCurrentWizardStep}
                disabled={executing || analyzing || !wizardCanExecuteCurrent}
              >
                {executing ? "Executing..." : "Execute This Step"}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => moveWizardStep(1)}
                disabled={wizardIndex >= wizardActionIds.length - 1 || executing}
              >
                {wizardIndex >= wizardActionIds.length - 1 ? "Last Step" : "Next Step"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
