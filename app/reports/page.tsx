"use client";

import * as React from "react";
import { EntityLookupInput } from "@/components/entity-lookup-input";
import { getJsonErrorMessage, readJsonResponse } from "@/lib/http-response";
import { useRouter } from "next/navigation";

type ReportPreset = {
  key: string;
  name: string;
  description: string;
  defaults: {
    status: "all" | "open" | "closed";
    types: string[];
  };
  isCustom?: boolean;
};

type ReportRow = {
  id: string;
  sourceKind: "OPPORTUNITY" | "INTAKE_COMPANY";
  opportunityId: string | null;
  title: string;
  type: string;
  stage: string;
  company: { id: string; name: string };
  healthSystem: { id: string; name: string } | null;
  declineReason:
    | "PRODUCT"
    | "INSUFFICIENT_ROI"
    | "HIGHLY_COMPETITIVE_LANDSCAPE"
    | "OUT_OF_INVESTMENT_THESIS_SCOPE"
    | "TOO_EARLY"
    | "TOO_MATURE_FOR_SEED_INVESTMENT"
    | "LACKS_PROOF_POINTS"
    | "INSUFFICIENT_TAM"
    | "TEAM"
    | "HEALTH_SYSTEM_BUYING_PROCESS"
    | "WORKFLOW_FRICTION"
    | "OTHER"
    | null;
  declineReasonOther: string | null;
  likelihoodPercent: number | null;
  contractPriceUsd: number | null;
  durationDays: number | null;
  nextSteps: string | null;
  notes: string | null;
  closeReason: string | null;
  estimatedCloseDate: string | null;
  closedAt: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
};

type OpportunityEditDraft = {
  opportunityId: string;
  companyId: string;
  type: string;
  stage: string;
  healthSystemId: string;
  likelihoodPercent: string;
  contractPriceUsd: string;
  estimatedCloseDate: string;
  nextSteps: string;
  closeReason: string;
  notes: string;
};

type ReportResponse = {
  presets: ReportPreset[];
  summary: {
    total: number;
    openCount: number;
    closedCount: number;
    wonCount: number;
    lostCount: number;
  };
  rows: ReportRow[];
};

type FilterOption = {
  id: string;
  name: string;
};

const CUSTOM_REPORT_PRESETS_STORAGE_KEY = "abundant-opportunity-report-presets";
const STANDARD_REPORT_PRESETS: ReportPreset[] = [
  {
    key: "open_intake",
    name: "Open Intake Opportunities",
    description: "Intake-phase opportunities that are not closed.",
    defaults: {
      status: "open",
      types: ["PROSPECT_PURSUIT"]
    }
  },
  {
    key: "closed_intake",
    name: "Closed Intake Opportunities",
    description: "Intake-phase opportunities that were won or lost.",
    defaults: {
      status: "closed",
      types: ["PROSPECT_PURSUIT"]
    }
  },
  {
    key: "open_screening",
    name: "Open Screening Opportunities",
    description: "Screening-phase LOI opportunities that are not closed.",
    defaults: {
      status: "open",
      types: ["SCREENING_LOI"]
    }
  },
  {
    key: "closed_screening",
    name: "Closed Screening Opportunities",
    description: "Screening-phase LOI opportunities that were won or lost.",
    defaults: {
      status: "closed",
      types: ["SCREENING_LOI"]
    }
  },
  {
    key: "open_commercial_acceleration",
    name: "Open Commercial Acceleration Opportunities",
    description: "Commercial contract opportunities that are not closed.",
    defaults: {
      status: "open",
      types: ["COMMERCIAL_CONTRACT"]
    }
  },
  {
    key: "closed_commercial_acceleration",
    name: "Closed Commercial Acceleration Opportunities",
    description: "Commercial contract opportunities that were won or lost.",
    defaults: {
      status: "closed",
      types: ["COMMERCIAL_CONTRACT"]
    }
  }
];

const opportunityTypeOptions: Array<{ value: string; label: string }> = [
  { value: "SCREENING_LOI", label: "Screening LOI" },
  { value: "COMMERCIAL_CONTRACT", label: "Commercial Contract" },
  { value: "VENTURE_STUDIO_SERVICES", label: "Venture Studio Services" },
  { value: "S1_TERM_SHEET", label: "S1 Term Sheet" },
  { value: "PROSPECT_PURSUIT", label: "Prospect Pursuit" }
];

const opportunityStageOptions: Array<{ value: string; label: string }> = [
  { value: "IDENTIFIED", label: "Identified" },
  { value: "QUALIFICATION", label: "Qualification" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "LEGAL", label: "Legal" },
  { value: "CLOSED_WON", label: "Closed Won" },
  { value: "CLOSED_LOST", label: "Closed Lost" },
  { value: "ON_HOLD", label: "On Hold" }
];

const declineReasonLabels: Record<Exclude<ReportRow["declineReason"], null>, string> = {
  PRODUCT: "Product",
  INSUFFICIENT_ROI: "Insufficient ROI",
  HIGHLY_COMPETITIVE_LANDSCAPE: "Highly Competitive Landscape",
  OUT_OF_INVESTMENT_THESIS_SCOPE: "Out of Investment Thesis Scope",
  TOO_EARLY: "Too Early",
  TOO_MATURE_FOR_SEED_INVESTMENT: "Too Mature for Seed Investment",
  LACKS_PROOF_POINTS: "Lacks Proof Points",
  INSUFFICIENT_TAM: "Insufficient TAM",
  TEAM: "Team",
  HEALTH_SYSTEM_BUYING_PROCESS: "Health System Buying Process",
  WORKFLOW_FRICTION: "Workflow Friction",
  OTHER: "Other"
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function parseNullableNumber(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDeclinedReason(row: ReportRow) {
  const opportunityReason = row.closeReason?.trim();
  if (opportunityReason) return opportunityReason;

  if (row.declineReason === "OTHER") {
    const otherReason = row.declineReasonOther?.trim();
    return otherReason || "Other";
  }

  if (row.declineReason) {
    return declineReasonLabels[row.declineReason] || row.declineReason;
  }

  return "-";
}

function makeCustomReportKey() {
  return `custom_report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeWithStandardReportPresets(presets: ReportPreset[]) {
  const byKey = new Map<string, ReportPreset>();
  for (const preset of STANDARD_REPORT_PRESETS) {
    byKey.set(preset.key, preset);
  }
  for (const preset of presets) {
    byKey.set(preset.key, preset);
  }
  return Array.from(byKey.values());
}

function normalizeSavedPreset(raw: unknown): ReportPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as {
    key?: unknown;
    name?: unknown;
    description?: unknown;
    defaults?: {
      status?: unknown;
      types?: unknown;
    };
    isCustom?: unknown;
  };
  if (typeof item.key !== "string" || !item.key.trim()) return null;
  if (typeof item.name !== "string" || !item.name.trim()) return null;
  const defaults = item.defaults;
  if (!defaults || typeof defaults !== "object") return null;
  const status = defaults.status === "all" || defaults.status === "open" || defaults.status === "closed" ? defaults.status : "all";
  if (typeof defaults.types !== "undefined" && !Array.isArray(defaults.types)) return null;
  const types = Array.isArray(defaults.types)
    ? defaults.types.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    key: item.key,
    name: item.name,
    description: typeof item.description === "string" ? item.description : "",
    defaults: { status, types },
    isCustom: true
  };
}

export default function ReportsPage() {
  const router = useRouter();

  const [presets, setPresets] = React.useState<ReportPreset[]>(STANDARD_REPORT_PRESETS);
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [summary, setSummary] = React.useState<ReportResponse["summary"]>({
    total: 0,
    openCount: 0,
    closedCount: 0,
    wonCount: 0,
    lostCount: 0
  });
  const [companies, setCompanies] = React.useState<FilterOption[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<FilterOption[]>([]);

  const [selectedPreset, setSelectedPreset] = React.useState<string>("open_screening");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "closed">("open");
  const [typeFilter, setTypeFilter] = React.useState<string>("SCREENING_LOI");
  const [stageFilter, setStageFilter] = React.useState<string>("");
  const [companyIdFilter, setCompanyIdFilter] = React.useState<string>("");
  const [healthSystemIdFilter, setHealthSystemIdFilter] = React.useState<string>("");
  const [createdFromFilter, setCreatedFromFilter] = React.useState<string>("");
  const [createdToFilter, setCreatedToFilter] = React.useState<string>("");
  const [isFilterModalOpen, setIsFilterModalOpen] = React.useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = React.useState<"all" | "open" | "closed">("open");
  const [draftTypeFilter, setDraftTypeFilter] = React.useState<string>("SCREENING_LOI");
  const [draftStageFilter, setDraftStageFilter] = React.useState<string>("");
  const [draftCompanyIdFilter, setDraftCompanyIdFilter] = React.useState<string>("");
  const [draftHealthSystemIdFilter, setDraftHealthSystemIdFilter] = React.useState<string>("");
  const [draftCreatedFromFilter, setDraftCreatedFromFilter] = React.useState<string>("");
  const [draftCreatedToFilter, setDraftCreatedToFilter] = React.useState<string>("");
  const [isReportMenuOpen, setIsReportMenuOpen] = React.useState(false);
  const [customPresets, setCustomPresets] = React.useState<ReportPreset[]>([]);
  const [isCreatingCustomReport, setIsCreatingCustomReport] = React.useState(false);
  const [draftReportName, setDraftReportName] = React.useState("");
  const [draftReportDescription, setDraftReportDescription] = React.useState("");
  const [reportPresetSaveError, setReportPresetSaveError] = React.useState<string | null>(null);
  const [isSavingCustomReport, setIsSavingCustomReport] = React.useState(false);
  const [editingNextStepId, setEditingNextStepId] = React.useState<string | null>(null);
  const [editingNextStepDraft, setEditingNextStepDraft] = React.useState("");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inlineNextStepsById, setInlineNextStepsById] = React.useState<Record<string, string>>({});
  const [savingNextStepId, setSavingNextStepId] = React.useState<string | null>(null);
  const [activeOpportunityModalDraft, setActiveOpportunityModalDraft] = React.useState<OpportunityEditDraft | null>(null);
  const [savingOpportunityModal, setSavingOpportunityModal] = React.useState(false);

  const upsertCompanyOption = React.useCallback((option: { id: string; name: string }) => {
    setCompanies((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [option, ...current];
    });
  }, []);

  const upsertHealthSystemOption = React.useCallback((option: { id: string; name: string }) => {
    setHealthSystems((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [option, ...current];
    });
  }, []);

  const applyPreset = React.useCallback((preset: ReportPreset) => {
    setSelectedPreset(preset.key);
    setStatusFilter(preset.defaults.status);
    setTypeFilter(preset.defaults.types[0] || "");
    setStageFilter("");
    setCompanyIdFilter("");
    setHealthSystemIdFilter("");
    setCreatedFromFilter("");
    setCreatedToFilter("");
    setIsReportMenuOpen(false);
  }, []);

  const openFilterModal = React.useCallback(() => {
    setIsCreatingCustomReport(false);
    setDraftStatusFilter(statusFilter);
    setDraftTypeFilter(typeFilter);
    setDraftStageFilter(stageFilter);
    setDraftCompanyIdFilter(companyIdFilter);
    setDraftHealthSystemIdFilter(healthSystemIdFilter);
    setDraftCreatedFromFilter(createdFromFilter);
    setDraftCreatedToFilter(createdToFilter);
    setDraftReportName("");
    setDraftReportDescription("");
    setReportPresetSaveError(null);
    setIsFilterModalOpen(true);
  }, [
    companyIdFilter,
    createdFromFilter,
    createdToFilter,
    healthSystemIdFilter,
    stageFilter,
    statusFilter,
    typeFilter
  ]);

  const openCustomReportBuilder = React.useCallback(() => {
    setIsCreatingCustomReport(true);
    setDraftStatusFilter(statusFilter);
    setDraftTypeFilter(typeFilter);
    setDraftStageFilter(stageFilter);
    setDraftCompanyIdFilter(companyIdFilter);
    setDraftHealthSystemIdFilter(healthSystemIdFilter);
    setDraftCreatedFromFilter(createdFromFilter);
    setDraftCreatedToFilter(createdToFilter);
    const selected = presets.find((entry) => entry.key === selectedPreset);
    setDraftReportName(`${selected?.name || "New"} Report`);
    setDraftReportDescription(selected?.description || "");
    setReportPresetSaveError(null);
    setIsReportMenuOpen(false);
    setIsFilterModalOpen(true);
  }, [
    companyIdFilter,
    createdFromFilter,
    createdToFilter,
    healthSystemIdFilter,
    presets,
    selectedPreset,
    stageFilter,
    statusFilter,
    typeFilter
  ]);

  const allPresets = React.useMemo(() => [...presets, ...customPresets], [customPresets, presets]);
  const selectedPresetLabel = React.useMemo(() => {
    return allPresets.find((entry) => entry.key === selectedPreset)?.name || "Select report";
  }, [allPresets, selectedPreset]);
  const selectedPresetDescription = React.useMemo(() => {
    return allPresets.find((entry) => entry.key === selectedPreset)?.description || "Custom report";
  }, [allPresets, selectedPreset]);

  const applyDraftFilters = React.useCallback(() => {
    if (isCreatingCustomReport) {
      const name = draftReportName.trim();
      if (!name) {
        setReportPresetSaveError("Give your report a name before saving.");
        return;
      }

      const nextPreset: ReportPreset = {
        key: makeCustomReportKey(),
        name,
        description: draftReportDescription.trim(),
        defaults: {
          status: draftStatusFilter,
          types: draftTypeFilter ? [draftTypeFilter] : []
        },
        isCustom: true
      };
      setIsSavingCustomReport(true);
      setCustomPresets((current) => [nextPreset, ...current]);
      setSelectedPreset(nextPreset.key);
      setReportPresetSaveError(null);
      setIsSavingCustomReport(false);
    } else {
      setReportPresetSaveError(null);
    }

    setStatusFilter(draftStatusFilter);
    setTypeFilter(draftTypeFilter);
    setStageFilter(draftStageFilter);
    setCompanyIdFilter(draftCompanyIdFilter);
    setHealthSystemIdFilter(draftHealthSystemIdFilter);
    setCreatedFromFilter(draftCreatedFromFilter);
    setCreatedToFilter(draftCreatedToFilter);
    setIsCreatingCustomReport(false);
    setIsFilterModalOpen(false);
  }, [
    draftCompanyIdFilter,
    draftCreatedFromFilter,
    draftCreatedToFilter,
    draftHealthSystemIdFilter,
    draftStageFilter,
    draftReportDescription,
    draftReportName,
    draftStatusFilter,
    draftTypeFilter,
    isCreatingCustomReport
  ]);

  const clearAppliedFilters = React.useCallback(() => {
    setStatusFilter("all");
    setTypeFilter("");
    setStageFilter("");
    setCompanyIdFilter("");
    setHealthSystemIdFilter("");
    setCreatedFromFilter("");
    setCreatedToFilter("");
    setSelectedPreset("");
  }, []);

  const clearDraftFilters = React.useCallback(() => {
    setDraftStatusFilter("all");
    setDraftTypeFilter("");
    setDraftStageFilter("");
    setDraftCompanyIdFilter("");
    setDraftHealthSystemIdFilter("");
    setDraftCreatedFromFilter("");
    setDraftCreatedToFilter("");
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CUSTOM_REPORT_PRESETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.map((entry) => normalizeSavedPreset(entry)).filter(Boolean) as ReportPreset[];
      setCustomPresets(normalized);
    } catch {
      // Ignore invalid stored values to avoid blocking report loading.
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOM_REPORT_PRESETS_STORAGE_KEY, JSON.stringify(customPresets));
  }, [customPresets]);

  React.useEffect(() => {
    let active = true;

    const loadFilterOptions = async () => {
      try {
        const res = await fetch("/api/reports/opportunities/options", { cache: "no-store" });
        const payload = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(getJsonErrorMessage(payload, "Failed to load report filter options."));
        }
        if (!active) return;
        setCompanies(Array.isArray(payload.companies) ? (payload.companies as FilterOption[]) : []);
        setHealthSystems(Array.isArray(payload.healthSystems) ? (payload.healthSystems as FilterOption[]) : []);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load report filters.");
      }
    };

    void loadFilterOptions();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    const query = new URLSearchParams();
    if (selectedPreset) query.set("preset", selectedPreset);
    query.set("status", statusFilter);
    if (typeFilter) query.set("types", typeFilter);
    if (stageFilter) query.set("stages", stageFilter);
    if (companyIdFilter) query.set("companyIds", companyIdFilter);
    if (healthSystemIdFilter) query.set("healthSystemIds", healthSystemIdFilter);
    if (createdFromFilter) query.set("createdFrom", createdFromFilter);
    if (createdToFilter) query.set("createdTo", createdToFilter);

    const loadReport = async () => {
      try {
        const res = await fetch(`/api/reports/opportunities?${query.toString()}`, { cache: "no-store" });
        const payload = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(getJsonErrorMessage(payload, "Failed to load report."));
        }
        if (!active) return;
        setPresets(
          mergeWithStandardReportPresets(
            Array.isArray(payload.presets) ? (payload.presets as ReportPreset[]) : []
          )
        );
        setRows(Array.isArray(payload.rows) ? (payload.rows as ReportRow[]) : []);
        setSummary(
          (payload.summary as ReportResponse["summary"] | undefined) || {
            total: 0,
            openCount: 0,
            closedCount: 0,
            wonCount: 0,
            lostCount: 0
          }
        );
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load report.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadReport();

    return () => {
      active = false;
    };
  }, [
    selectedPreset,
    statusFilter,
    typeFilter,
    stageFilter,
    companyIdFilter,
    healthSystemIdFilter,
    createdFromFilter,
    createdToFilter
  ]);

  const activeFilterPills = React.useMemo(() => {
    const companyName = companies.find((entry) => entry.id === companyIdFilter)?.name || null;
    const healthSystemName = healthSystems.find((entry) => entry.id === healthSystemIdFilter)?.name || null;
    const rows: string[] = [];
    if (stageFilter) rows.push(`Win/Loss: ${stageFilter}`);
    if (companyName) rows.push(`Company: ${companyName}`);
    if (healthSystemName) rows.push(`Health System: ${healthSystemName}`);
    if (createdFromFilter) rows.push(`From: ${formatDate(createdFromFilter)}`);
    if (createdToFilter) rows.push(`To: ${formatDate(createdToFilter)}`);
    return rows;
  }, [
    companies,
    companyIdFilter,
    createdFromFilter,
    createdToFilter,
    healthSystemIdFilter,
    healthSystems,
    stageFilter
  ]);

  React.useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of rows) {
      next[row.id] = row.nextSteps || "";
    }
    setInlineNextStepsById(next);
  }, [rows]);

  function applyOpportunityRowUpdate(opportunity: {
    id: string;
    title: string;
    type: string;
    stage: string;
    likelihoodPercent: number | null;
    contractPriceUsd: number | null;
    nextSteps: string | null;
    notes: string | null;
    closeReason: string | null;
    estimatedCloseDate: string | null;
    updatedAt: string;
    healthSystem: { id: string; name: string } | null;
  }) {
    setRows((current) =>
      current.map((row) =>
        row.id === opportunity.id
          ? {
              ...row,
              title: opportunity.title,
              type: opportunity.type,
              stage: opportunity.stage,
              likelihoodPercent: opportunity.likelihoodPercent,
              contractPriceUsd: opportunity.contractPriceUsd,
              nextSteps: opportunity.nextSteps,
              notes: opportunity.notes,
              closeReason: opportunity.closeReason,
              estimatedCloseDate: opportunity.estimatedCloseDate,
              updatedAt: opportunity.updatedAt,
              healthSystem: opportunity.healthSystem
            }
          : row
      )
    );
    setInlineNextStepsById((current) => ({
      ...current,
      [opportunity.id]: opportunity.nextSteps || ""
    }));
  }

  function openOpportunityModal(row: ReportRow) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    if (row.sourceKind === "OPPORTUNITY" && row.opportunityId) {
      router.push(
        `/pipeline/${row.company.id}?returnTo=${encodeURIComponent(returnTo)}&opportunityId=${encodeURIComponent(row.opportunityId)}`
      );
      return;
    }
    router.push(`/pipeline/${row.company.id}?returnTo=${encodeURIComponent(returnTo)}`);
  }

  function openCompanyIntakeModal(row: ReportRow) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    router.push(`/pipeline/${row.company.id}?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function saveInlineNextStep(row: ReportRow, nextStepOverride?: string) {
    if (row.sourceKind !== "OPPORTUNITY") return;

    const nextValue = (nextStepOverride ?? inlineNextStepsById[row.id] ?? "").trim();
    const currentValue = (row.nextSteps || "").trim();
    setSavingNextStepId(row.id);
    if (nextValue === currentValue) {
      setSavingNextStepId(null);
      setEditingNextStepId(null);
      return;
    }

    try {
      const res = await fetch(`/api/pipeline/opportunities/${row.company.id}/opportunities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: row.opportunityId,
          nextSteps: nextValue || null
        })
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to update next step."));
      }
      const opportunity = payload.opportunity as {
        id: string;
        title: string;
        type: string;
        stage: string;
        likelihoodPercent: number | null;
        contractPriceUsd: number | null;
        nextSteps: string | null;
        notes: string | null;
        closeReason: string | null;
        estimatedCloseDate: string | null;
        updatedAt: string;
        healthSystem: { id: string; name: string } | null;
      };
      applyOpportunityRowUpdate(opportunity);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update next step.");
      setEditingNextStepId(null);
      setInlineNextStepsById((current) => ({
        ...current,
        [row.id]: row.nextSteps || ""
      }));
    } finally {
      setSavingNextStepId(null);
    }
  }

  async function saveOpportunityModal() {
    const draft = activeOpportunityModalDraft;
    if (!draft) return;
    setSavingOpportunityModal(true);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${draft.companyId}/opportunities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: draft.opportunityId,
          type: draft.type,
          stage: draft.stage,
          healthSystemId: draft.healthSystemId || "",
          likelihoodPercent: (() => {
            const parsed = parseNullableNumber(draft.likelihoodPercent);
            if (parsed === null) return null;
            return Math.max(0, Math.min(100, Math.round(parsed)));
          })(),
          contractPriceUsd: parseNullableNumber(draft.contractPriceUsd),
          estimatedCloseDate: draft.estimatedCloseDate || null,
          nextSteps: draft.nextSteps.trim() || null,
          closeReason: draft.closeReason.trim() || null,
          notes: draft.notes.trim() || null
        })
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to update opportunity."));
      }
      const opportunity = payload.opportunity as {
        id: string;
        title: string;
        type: string;
        stage: string;
        likelihoodPercent: number | null;
        contractPriceUsd: number | null;
        nextSteps: string | null;
        notes: string | null;
        closeReason: string | null;
        estimatedCloseDate: string | null;
        updatedAt: string;
        healthSystem: { id: string; name: string } | null;
      };
      applyOpportunityRowUpdate(opportunity);
      setActiveOpportunityModalDraft(null);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update opportunity.");
    } finally {
      setSavingOpportunityModal(false);
    }
  }

  const showDeclinedReasonColumn = statusFilter === "closed";

  return (
    <main>
      <section className="panel">
        <div className="report-toolbar">
          <div className="report-toolbar-title-row">
            <h2>Report</h2>
            <div
              className="report-selector-shell"
              onMouseEnter={() => setIsReportMenuOpen(true)}
              onMouseLeave={() => setIsReportMenuOpen(false)}
              onFocus={() => setIsReportMenuOpen(true)}
              onBlur={(event) => {
                const target = event.relatedTarget as HTMLElement | null;
                if (!event.currentTarget.contains(target)) {
                  setIsReportMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="report-selector-field"
                onClick={() => setIsReportMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsReportMenuOpen(false);
                  }
                }}
                aria-label={`Select report, current report is ${selectedPresetLabel}`}
              >
                <span>{selectedPresetLabel}</span>
                <span className="report-selector-caret" aria-hidden="true" />
              </button>
              <div className={`report-selector-menu ${isReportMenuOpen ? "open" : ""}`}>
                <div className="report-selector-group-title">Saved Reports</div>
                {allPresets.length === 0 ? (
                  <p className="muted">No saved reports.</p>
                ) : (
                  allPresets.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      className={`report-selector-option ${preset.key === selectedPreset ? "active" : ""}`}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </button>
                  ))
                )}
                <div className="report-selector-divider" />
                <button
                  type="button"
                  className="report-selector-option report-selector-option-primary"
                  onClick={openCustomReportBuilder}
                >
                  + New Report
                </button>
              </div>
            </div>
          </div>
          <div className="report-toolbar-meta">
            <p className="muted" style={{ margin: 0 }}>
              {selectedPresetDescription}
            </p>
            {activeFilterPills.length > 0 ? (
              <div className="report-filter-chip-row">
                {activeFilterPills.map((entry) => (
                  <span key={entry} className="chip">
                    {entry}
                  </span>
                ))}
              </div>
            ) : (
              <span className="muted">No additional filters applied.</span>
            )}
          </div>
          <div className="actions">
            <button type="button" className="ghost small" onClick={clearAppliedFilters}>
              Clear
            </button>
            <button type="button" className="secondary small" onClick={openFilterModal}>
              Filters
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Report Rows</h2>
        {loading ? <p className="muted">Loading report...</p> : null}
        {!loading && error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="muted">No opportunities match your filters.</p> : null}

        {!loading && !error && rows.length > 0 ? (
          <>
            <div className="table-wrap report-table-wrap" style={{ marginTop: 10 }}>
              <table className="table table-dense report-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Opportunity</th>
                    <th>Health System</th>
                    <th>Stage</th>
                    <th>Next Step</th>
                    <th>Likelihood</th>
                    <th>Contract Price</th>
                    <th>Expected Close</th>
                    {showDeclinedReasonColumn ? <th>Declined Reason</th> : null}
                    <th>Contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="report-opportunity-link"
                          onClick={() => openCompanyIntakeModal(row)}
                        >
                          {row.company.name}
                        </button>
                      </td>
                      <td>
                        {row.sourceKind === "OPPORTUNITY" ? (
                          <button
                            type="button"
                            className="report-opportunity-link"
                            onClick={() => openOpportunityModal(row)}
                          >
                            {row.title}
                          </button>
                        ) : (
                          row.title
                        )}
                      </td>
                      <td>{row.healthSystem?.name || "-"}</td>
                      <td>{row.stage}</td>
                      <td>
                        <div className="report-next-step-cell">
                          {row.sourceKind !== "OPPORTUNITY" ? (
                            <span>{row.nextSteps?.trim() || "-"}</span>
                          ) : editingNextStepId === row.id ? (
                            <input
                              className="report-next-step-input"
                              autoFocus
                              value={editingNextStepDraft}
                              onChange={(event) => setEditingNextStepDraft(event.target.value)}
                              onBlur={() => {
                                void saveInlineNextStep(row, editingNextStepDraft);
                                setEditingNextStepId(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  event.currentTarget.blur();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setInlineNextStepsById((current) => ({
                                    ...current,
                                    [row.id]: row.nextSteps || ""
                                  }));
                                  setEditingNextStepId(null);
                                }
                              }}
                              disabled={savingNextStepId === row.id}
                              placeholder="Add next step..."
                            />
                          ) : (
                            <button
                              type="button"
                              className={`report-next-step-display ${inlineNextStepsById[row.id] ? "" : "empty"}`}
                              onClick={() => {
                                setEditingNextStepDraft(inlineNextStepsById[row.id] || "");
                                setEditingNextStepId(row.id);
                              }}
                            >
                              {inlineNextStepsById[row.id]?.trim() || "Add next step"}
                            </button>
                          )}
                          {row.sourceKind === "OPPORTUNITY" && savingNextStepId === row.id ? (
                            <span className="muted">Saving…</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{row.likelihoodPercent === null ? "-" : `${row.likelihoodPercent}%`}</td>
                      <td>{formatCurrency(row.contractPriceUsd)}</td>
                      <td>{formatDate(row.estimatedCloseDate)}</td>
                      {showDeclinedReasonColumn ? <td>{formatDeclinedReason(row)}</td> : null}
                      <td>{row.contactCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="chip-row report-summary-bottom">
              <span className="chip">Total: {summary.total}</span>
              <span className="chip">Won: {summary.wonCount}</span>
              <span className="chip">Lost: {summary.lostCount}</span>
            </div>
          </>
        ) : null}
      </section>

      {activeOpportunityModalDraft ? (
        <div
          className="report-filter-modal-backdrop"
          onClick={() => setActiveOpportunityModalDraft(null)}
          role="presentation"
        >
          <section
            className="report-filter-modal report-opportunity-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit opportunity"
          >
            <h2>Edit Opportunity</h2>
            <div className="detail-grid">
              <div>
                <label>Type</label>
                <select
                  value={activeOpportunityModalDraft.type}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, type: event.target.value } : current
                    )
                  }
                >
                  {opportunityTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Health System</label>
                <EntityLookupInput
                  entityKind="HEALTH_SYSTEM"
                  value={activeOpportunityModalDraft.healthSystemId}
                  onChange={(nextValue) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, healthSystemId: nextValue } : current
                    )
                  }
                  initialOptions={healthSystems}
                  allowEmpty
                  emptyLabel="No health system"
                  placeholder="Search health systems"
                  autoOpenCreateOnEnterNoMatch
                  onEntityCreated={upsertHealthSystemOption}
                />
              </div>
              <div>
                <label>Stage</label>
                <select
                  value={activeOpportunityModalDraft.stage}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, stage: event.target.value } : current
                    )
                  }
                >
                  {opportunityStageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Likelihood (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={activeOpportunityModalDraft.likelihoodPercent}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, likelihoodPercent: event.target.value } : current
                    )
                  }
                />
              </div>
              <div>
                <label>Contract Price (USD)</label>
                <input
                  value={activeOpportunityModalDraft.contractPriceUsd}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, contractPriceUsd: event.target.value } : current
                    )
                  }
                />
              </div>
              <div>
                <label>Estimated Close</label>
                <input
                  type="date"
                  value={activeOpportunityModalDraft.estimatedCloseDate}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, estimatedCloseDate: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <label>Next Step</label>
                <textarea
                  value={activeOpportunityModalDraft.nextSteps}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, nextSteps: event.target.value } : current
                    )
                  }
                  rows={3}
                />
              </div>
              <div>
                <label>Close Reason</label>
                <textarea
                  value={activeOpportunityModalDraft.closeReason}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, closeReason: event.target.value } : current
                    )
                  }
                  rows={3}
                />
              </div>
              <div>
                <label>Notes</label>
                <textarea
                  value={activeOpportunityModalDraft.notes}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, notes: event.target.value } : current
                    )
                  }
                  rows={4}
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="ghost small"
                onClick={() => setActiveOpportunityModalDraft(null)}
                disabled={savingOpportunityModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="secondary small"
                onClick={() => void saveOpportunityModal()}
                disabled={savingOpportunityModal}
              >
                {savingOpportunityModal ? "Saving..." : "Save Opportunity"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isFilterModalOpen ? (
        <div
          className="report-filter-modal-backdrop"
          onClick={() => setIsFilterModalOpen(false)}
          role="presentation"
        >
          <section
            className="report-filter-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Opportunity report filters"
          >
            <h2>Report Filters</h2>
            {isCreatingCustomReport ? (
              <>
                <div className="detail-grid">
                  <div>
                    <label>Report Name</label>
                    <input
                      value={draftReportName}
                      onChange={(event) => setDraftReportName(event.target.value)}
                      placeholder="e.g. Screening Pipeline"
                    />
                  </div>
                  <div>
                    <label>Description</label>
                    <input
                      value={draftReportDescription}
                      onChange={(event) => setDraftReportDescription(event.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {reportPresetSaveError ? <p className="status error">{reportPresetSaveError}</p> : null}
              </>
            ) : null}
            <div className="detail-grid">
              <div>
                <label>Status</label>
                <select
                  value={draftStatusFilter}
                  onChange={(event) => setDraftStatusFilter(event.target.value as "all" | "open" | "closed")}
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label>Opportunity Type</label>
                <select value={draftTypeFilter} onChange={(event) => setDraftTypeFilter(event.target.value)}>
                  <option value="">All Types</option>
                  {opportunityTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Win / Loss</label>
                <select value={draftStageFilter} onChange={(event) => setDraftStageFilter(event.target.value)}>
                  <option value="">Any</option>
                  <option value="CLOSED_WON">Won</option>
                  <option value="CLOSED_LOST">Lost</option>
                </select>
              </div>
              <div>
                <label>Company</label>
                <EntityLookupInput
                  entityKind="COMPANY"
                  value={draftCompanyIdFilter}
                  onChange={setDraftCompanyIdFilter}
                  initialOptions={companies}
                  allowEmpty
                  emptyLabel="All Companies"
                  placeholder="Search companies"
                  autoOpenCreateOnEnterNoMatch
                  onEntityCreated={upsertCompanyOption}
                />
              </div>
              <div>
                <label>Health System</label>
                <EntityLookupInput
                  entityKind="HEALTH_SYSTEM"
                  value={draftHealthSystemIdFilter}
                  onChange={setDraftHealthSystemIdFilter}
                  initialOptions={healthSystems}
                  allowEmpty
                  emptyLabel="All Health Systems"
                  placeholder="Search health systems"
                  autoOpenCreateOnEnterNoMatch
                  onEntityCreated={upsertHealthSystemOption}
                />
              </div>
              <div>
                <label>Date Created (From)</label>
                <input
                  type="date"
                  value={draftCreatedFromFilter}
                  onChange={(event) => setDraftCreatedFromFilter(event.target.value)}
                />
              </div>
              <div>
                <label>Date Created (To)</label>
                <input
                  type="date"
                  value={draftCreatedToFilter}
                  onChange={(event) => setDraftCreatedToFilter(event.target.value)}
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button type="button" className="ghost small" onClick={clearDraftFilters}>
                Clear Draft
              </button>
              <button type="button" className="ghost small" onClick={() => setIsFilterModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="secondary small"
                onClick={() => void applyDraftFilters()}
                disabled={isCreatingCustomReport && isSavingCustomReport}
              >
                {isCreatingCustomReport ? (isSavingCustomReport ? "Saving..." : "Save Report") : "Apply Filters"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
