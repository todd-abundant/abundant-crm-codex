"use client";

import * as React from "react";
import { InlineTextField } from "./inline-detail-field";
import {
  LeadSourceEntityPicker,
  LEAD_SOURCE_TYPE_OPTIONS,
  type EntitySearchResult
} from "./company-pipeline-manager";

/* ─── Types ─────────────────────────────────────────────────────────── */

type StatusOption = { value: string; label: string };
type StageOption  = { value: string; label: string };
type DateDebugContext = string | Record<string, unknown>;

type HealthSystemParticipationItem = {
  id: string;
  name: string;
  loiStatusLabel: string;
  currentInterestLabel: string;
  opportunityStageLabel: string;
  statusUpdate: string;
  memberFeedbackStatus: string;
  updatedAtLabel: string;
};

type OpenTaskItem = {
  id: string;
  title: string;
  detail: string;
  dueLabel: string;
};

type ActivityTimelineItem = {
  id: string;
  title: string;
  description: string;
  timestampLabel: string;
  badge?: string;
};

type VentureStudioOpportunityTabContentProps = {
  companyName?: string;
  location?: string;
  description?: string;
  onGenerateDescription?: () => void;
  ownerLabel: string;
  ownerName: string;
  createdDate: string;
  activePipelineColumn: string | null;
  currentFocusLabel: string;
  lastActivityLabel?: string;
  daysInStageLabel?: string;
  stageOptions: StageOption[];
  onCurrentStageChange: (value: string) => void;
  isMovingStage?: boolean;
  pipelineStepLabel: string;
  healthSystemParticipation?: HealthSystemParticipationItem[];
  nextStepLabel?: string;
  nextStepDueLabel?: string;
  nextStepDueAt?: string | null;
  openTasks?: OpenTaskItem[];
  activityTimeline?: ActivityTimelineItem[];
  s1InvestmentStage?: string;
  showStatusControls: boolean;
  statusValue: string;
  statusOptions: StatusOption[];
  onStatusSave: (value: string) => void;
  statusReadOnlyLabel: string;
  closedReasonLabel: string;
  closedReasonValue: string;
  closedReasonPlaceholder: string;
  reasonListId: string;
  reasonSuggestions: string[];
  onClosedReasonSave: (value: string) => void;
  isClosedLostStatus: boolean;
  likelihoodValue: string;
  onLikelihoodSave: (value: string) => void;
  estimatedCloseDate: string;
  estimatedCloseDateDebugContext?: DateDebugContext;
  onEstimatedCloseDateSave: (value: string) => void;
  closedDateDisplay: string;
  intakeDecisionDate: string;
  intakeDecisionDateDebugContext?: DateDebugContext;
  onIntakeDecisionDateSave: (value: string) => void;
  ventureStudioContractExecutedDate: string;
  ventureStudioContractExecutedDateDebugContext?: DateDebugContext;
  onVentureStudioContractExecutedDateSave: (value: string) => void;
  showScreeningWebinars: boolean;
  screeningWebinarDate1: string;
  screeningWebinarDate1DebugContext?: DateDebugContext;
  onScreeningWebinarDate1Save: (value: string) => void;
  screeningWebinarDate2: string;
  screeningWebinarDate2DebugContext?: DateDebugContext;
  onScreeningWebinarDate2Save: (value: string) => void;
  leadSourceType: string;
  leadSourceEntityId: string;
  leadSourceEntityType: string;
  leadSourceEntityName: string;
  onLeadSourceTypeSave: (value: string) => void;
  onLeadSourceEntitySave: (id: string, entityType: string, name: string) => void;
  onLeadSourceEntityClear: () => void;
  /* ── New intake / snapshot fields ── */
  pipelineCompanyType?: string;
  fundingStage?: string;
  amountRaising?: number | null;
  targetCustomer?: string;
  valueProp?: string;
  submittingHealthSystemId?: string;
  intakeStep?: string;
  onPipelineCompanyTypeSave?: (v: string | null) => void;
  onFundingStageSave?: (v: string | null) => void;
  onAmountRaisingSave?: (v: string) => void;
  onTargetCustomerSave?: (v: string) => void;
  onValuePropSave?: (v: string) => void;
  onSubmittingHealthSystemSave?: (id: string | null, name: string | null) => void;
  onIntakeStepSave?: (v: string | null) => void;
};

/* ─── Pill option maps ───────────────────────────────────────────────── */

const COMPANY_TYPE_OPTIONS = [
  { value: "DE_NOVO",     label: "De Novo" },
  { value: "SPIN_OUT",    label: "Spin-out" },
  { value: "EARLY_STAGE", label: "Early Stage" },
];

const FUNDING_STAGE_OPTIONS = [
  { value: "PRE_SEED", label: "Pre-seed" },
  { value: "SEED",     label: "Seed" },
  { value: "SERIES_A", label: "Series A" },
  { value: "SERIES_B", label: "Series B" },
  { value: "OTHER",    label: "Other" },
];

const INTAKE_STEP_OPTIONS = [
  { value: "INITIAL_CALL",           label: "Initial Call" },
  { value: "DEEPER_DIVE",            label: "Deeper Dive" },
  { value: "PROPOSAL_REVIEW",        label: "Proposal Review" },
  { value: "MANAGEMENT_PRESENTATION",label: "Mgmt. Presentation" },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function leadSourceTypeLabel(value: string): string {
  return LEAD_SOURCE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

function getInitials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function getStatusVariant(value: string): string {
  const v = value.toUpperCase();
  if (v.includes("WON"))     return "won";
  if (v.includes("LOST"))    return "lost";
  if (v.includes("REVISIT")) return "revisit";
  return "open";
}

function getTimelineDotVariant(badge?: string): string {
  if (!badge) return "note";
  const b = badge.toLowerCase();
  if (b.includes("status") || b.includes("stage") || b.includes("focus")) return "status";
  if (b.includes("meeting") || b.includes("webinar")) return "meeting";
  return "note";
}

function isOverdue(dateAt: string | null | undefined): boolean {
  if (!dateAt) return false;
  return new Date(dateAt).getTime() < Date.now();
}

function formatAmountDisplay(value: number | null | undefined): string {
  if (value == null) return "";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/* ─── Inline primitive: PillSelector ────────────────────────────────── */

function PillSelector({
  options,
  value,
  onSelect,
  label,
}: {
  options: { value: string; label: string }[];
  value: string;
  onSelect: (v: string | null) => void;
  label?: string;
}) {
  return (
    <div className="vs-pill-group" role="group" aria-label={label}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`vs-pill${active ? " vs-pill--active" : ""}`}
            onClick={() => onSelect(active ? null : opt.value)}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Inline primitive: InlineTextArea ──────────────────────────────── */

function InlineTextArea({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    onSave(draft);
  }

  if (editing) {
    return (
      <div className="vs-inline-ta-wrap">
        <label className="vs-card-label">{label}</label>
        <textarea
          ref={taRef}
          className="vs-inline-ta"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={placeholder}
          autoFocus
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="vs-inline-ta-display"
      onClick={() => { setDraft(value); setEditing(true); setTimeout(() => taRef.current?.focus(), 0); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setDraft(value); setEditing(true); } }}
    >
      <label className="vs-card-label">{label}</label>
      {value ? (
        <p className="vs-snapshot-text">{value}</p>
      ) : (
        <p className="vs-placeholder-text">{placeholder ?? "Click to add…"}</p>
      )}
    </div>
  );
}

/* ─── Inline primitive: InlineAmountField ───────────────────────────── */

function InlineAmountField({
  value,
  onSave,
}: {
  value: number | null | undefined;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value != null ? String(value) : "");

  React.useEffect(() => { setDraft(value != null ? String(value) : ""); }, [value]);

  function commit() {
    setEditing(false);
    onSave(draft);
  }

  if (editing) {
    return (
      <input
        className="vs-amount-input"
        type="number"
        min={0}
        step={50000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value != null ? String(value) : ""); setEditing(false); } }}
        placeholder="e.g. 2000000"
        autoFocus
      />
    );
  }

  return (
    <span
      className={value != null ? "vs-amount-value" : "vs-placeholder-text"}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setEditing(true); }}
    >
      {value != null ? formatAmountDisplay(value) : "Click to set amount"}
    </span>
  );
}

/* ─── Lead Source inline display for header ─────────────────────────── */

function LeadSourceHeaderLine({
  leadSourceType,
  leadSourceEntityId,
  leadSourceEntityType,
  leadSourceEntityName,
  onLeadSourceTypeSave,
  onLeadSourceEntitySave,
  onLeadSourceEntityClear,
}: {
  leadSourceType: string;
  leadSourceEntityId: string;
  leadSourceEntityType: string;
  leadSourceEntityName: string;
  onLeadSourceTypeSave: (value: string) => void;
  onLeadSourceEntitySave: (id: string, entityType: string, name: string) => void;
  onLeadSourceEntityClear: () => void;
}) {
  const [editing, setEditing] = React.useState(false);

  const typeLabel  = leadSourceTypeLabel(leadSourceType);
  const hasType    = Boolean(leadSourceType);
  const hasEntity  = Boolean(leadSourceEntityId);

  if (editing) {
    return (
      <div className="vs-ls-edit-row">
        <select
          value={leadSourceType}
          onChange={(e) => onLeadSourceTypeSave(e.target.value)}
          className="vs-ls-select"
        >
          <option value="">— Type —</option>
          {LEAD_SOURCE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <LeadSourceEntityPicker
          entityId={leadSourceEntityId}
          entityType={leadSourceEntityType}
          entityName={leadSourceEntityName}
          onSelect={(r: EntitySearchResult) =>
            onLeadSourceEntitySave(r.id, r.entityType, r.name)
          }
          onClear={onLeadSourceEntityClear}
        />
        <button type="button" className="vs-ls-done" onClick={() => setEditing(false)}>
          Done
        </button>
      </div>
    );
  }

  if (!hasType && !hasEntity) {
    return (
      <button type="button" className="vs-add-lead-source" onClick={() => setEditing(true)}>
        ＋ Add lead source
      </button>
    );
  }

  const parts: string[] = [];
  if (hasType)   parts.push(typeLabel);
  if (hasEntity) parts.push(leadSourceEntityName);
  const display = `Sourced via ${parts.join(" · ")}`;

  return (
    <div className="vs-ls-line">
      <span className="vs-ls-text">{display}</span>
      <button
        type="button"
        className="vs-ls-pencil"
        onClick={() => setEditing(true)}
        aria-label="Edit lead source"
        title="Edit lead source"
      >
        ✎
      </button>
    </div>
  );
}

/* ─── Intake Step Indicator ─────────────────────────────────────────── */

function IntakeStepIndicator({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (v: string | null) => void;
}) {
  const activeIdx = INTAKE_STEP_OPTIONS.findIndex((o) => o.value === value);

  return (
    <div className="vs-intake-steps">
      {INTAKE_STEP_OPTIONS.map((opt, idx) => {
        const isActive  = opt.value === value;
        const isPast    = idx < activeIdx;
        return (
          <button
            key={opt.value}
            type="button"
            className={`vs-intake-step${isActive ? " vs-intake-step--active" : ""}${isPast ? " vs-intake-step--past" : ""}`}
            onClick={() => onSelect(isActive ? null : opt.value)}
            aria-pressed={isActive}
          >
            <span className="vs-intake-step-dot" aria-hidden="true" />
            <span className="vs-intake-step-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Company Snapshot Card (INTAKE only) ───────────────────────────── */

function CompanySnapshotCard({
  pipelineCompanyType = "",
  fundingStage = "",
  amountRaising,
  targetCustomer = "",
  valueProp = "",
  onPipelineCompanyTypeSave,
  onFundingStageSave,
  onAmountRaisingSave,
  onTargetCustomerSave,
  onValuePropSave,
}: {
  pipelineCompanyType?: string;
  fundingStage?: string;
  amountRaising?: number | null;
  targetCustomer?: string;
  valueProp?: string;
  onPipelineCompanyTypeSave?: (v: string | null) => void;
  onFundingStageSave?: (v: string | null) => void;
  onAmountRaisingSave?: (v: string) => void;
  onTargetCustomerSave?: (v: string) => void;
  onValuePropSave?: (v: string) => void;
}) {
  return (
    <div className="vs-card vs-snapshot-card">
      <p className="vs-card-label">COMPANY SNAPSHOT</p>

      {/* Company Type */}
      <div className="vs-snapshot-row">
        <span className="vs-snapshot-field-label">Company Type</span>
        <PillSelector
          options={COMPANY_TYPE_OPTIONS}
          value={pipelineCompanyType}
          onSelect={onPipelineCompanyTypeSave ?? (() => {})}
          label="Company Type"
        />
      </div>

      {/* Funding Stage */}
      <div className="vs-snapshot-row">
        <span className="vs-snapshot-field-label">Funding Stage</span>
        <PillSelector
          options={FUNDING_STAGE_OPTIONS}
          value={fundingStage}
          onSelect={onFundingStageSave ?? (() => {})}
          label="Funding Stage"
        />
      </div>

      {/* Amount Raising */}
      <div className="vs-snapshot-row vs-snapshot-row--amount">
        <span className="vs-snapshot-field-label">Amount Raising</span>
        <InlineAmountField
          value={amountRaising}
          onSave={onAmountRaisingSave ?? (() => {})}
        />
      </div>

      {/* Target Customer */}
      <div className="vs-snapshot-row vs-snapshot-row--full">
        <InlineTextArea
          label="TARGET CUSTOMER"
          value={targetCustomer}
          placeholder="Who does this company sell to?"
          onSave={onTargetCustomerSave ?? (() => {})}
        />
      </div>

      {/* Value Prop */}
      <div className="vs-snapshot-row vs-snapshot-row--full">
        <InlineTextArea
          label="VALUE PROPOSITION"
          value={valueProp}
          placeholder="What problem does this company solve?"
          onSave={onValuePropSave ?? (() => {})}
        />
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function VentureStudioOpportunityTabContent({
  companyName = "Company",
  location = "",
  description = "",
  onGenerateDescription,
  ownerName,
  createdDate,
  activePipelineColumn,
  currentFocusLabel,
  daysInStageLabel = "—",
  stageOptions,
  onCurrentStageChange,
  isMovingStage = false,
  pipelineStepLabel,
  healthSystemParticipation = [],
  nextStepLabel = "",
  nextStepDueLabel = "",
  nextStepDueAt,
  openTasks = [],
  activityTimeline = [],
  s1InvestmentStage = "",
  showStatusControls,
  statusValue,
  statusOptions,
  onStatusSave,
  closedReasonValue,
  closedReasonPlaceholder,
  reasonListId,
  reasonSuggestions,
  onClosedReasonSave,
  isClosedLostStatus,
  likelihoodValue,
  onLikelihoodSave,
  estimatedCloseDate,
  estimatedCloseDateDebugContext,
  onEstimatedCloseDateSave,
  closedDateDisplay,
  intakeDecisionDate,
  intakeDecisionDateDebugContext,
  onIntakeDecisionDateSave,
  ventureStudioContractExecutedDate,
  ventureStudioContractExecutedDateDebugContext,
  onVentureStudioContractExecutedDateSave,
  showScreeningWebinars,
  screeningWebinarDate1,
  screeningWebinarDate1DebugContext,
  onScreeningWebinarDate1Save,
  screeningWebinarDate2,
  screeningWebinarDate2DebugContext,
  onScreeningWebinarDate2Save,
  leadSourceType,
  leadSourceEntityId,
  leadSourceEntityType,
  leadSourceEntityName,
  onLeadSourceTypeSave,
  onLeadSourceEntitySave,
  onLeadSourceEntityClear,
  pipelineCompanyType = "",
  fundingStage = "",
  amountRaising,
  targetCustomer = "",
  valueProp = "",
  intakeStep = "",
  onPipelineCompanyTypeSave,
  onFundingStageSave,
  onAmountRaisingSave,
  onTargetCustomerSave,
  onValuePropSave,
  onIntakeStepSave,
}: VentureStudioOpportunityTabContentProps) {
  const statusRadioGroupId = React.useId();
  const [showAdvancePicker, setShowAdvancePicker] = React.useState(false);
  const [advanceValue, setAdvanceValue]           = React.useState(
    activePipelineColumn || stageOptions[0]?.value || ""
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const isIntake = activePipelineColumn === "INTAKE";
  const isClosedStatusValue =
    statusValue === "CLOSED_LOST" || statusValue === "CLOSED_REVISIT";
  const shouldShowStatusControls = showStatusControls || isClosedStatusValue;
  const focusDisplayLabel =
    activePipelineColumn ? currentFocusLabel : "Closed / Inactive";
  const nextStepOverdue = isOverdue(nextStepDueAt);

  React.useEffect(() => {
    setAdvanceValue(activePipelineColumn || stageOptions[0]?.value || "");
  }, [activePipelineColumn, stageOptions]);

  return (
    <div className="vs-workbench">

      {/* ── 1. Company header card ── */}
      <div className="vs-card vs-header-card">
        <h1 className="vs-company-name">{companyName}</h1>
        {location ? <p className="vs-company-location">{location}</p> : null}
        <p className="vs-company-desc">
          {description ? (
            description
          ) : (
            <>
              <span className="vs-desc-empty">No description yet — </span>
              <button
                type="button"
                className="vs-generate-link"
                onClick={onGenerateDescription ?? undefined}
                disabled={!onGenerateDescription}
              >
                ✦ Generate with AI
              </button>
            </>
          )}
        </p>
        <LeadSourceHeaderLine
          leadSourceType={leadSourceType}
          leadSourceEntityId={leadSourceEntityId}
          leadSourceEntityType={leadSourceEntityType}
          leadSourceEntityName={leadSourceEntityName}
          onLeadSourceTypeSave={onLeadSourceTypeSave}
          onLeadSourceEntitySave={onLeadSourceEntitySave}
          onLeadSourceEntityClear={onLeadSourceEntityClear}
        />
      </div>

      {/* ── 2. Pipeline Stage strip ── */}
      <div className="vs-stage-strip">
        <div className="vs-stage-strip-info">
          <div className="vs-stage-name">{focusDisplayLabel}</div>
          <div className="vs-stage-step">
            ↳ {pipelineStepLabel || <span style={{ color: "#9CA3AF" }}>No current activity</span>}
          </div>
        </div>
        <div className="vs-stage-strip-right">
          <span className="vs-stage-days">{daysInStageLabel} in stage</span>
          {stageOptions.length > 0 ? (
            <div className="vs-advance-wrap">
              <button
                type="button"
                className="vs-advance-btn"
                onClick={() => setShowAdvancePicker((v) => !v)}
                disabled={isMovingStage}
              >
                {isMovingStage ? "Moving…" : "Advance Stage"}
              </button>
              {showAdvancePicker ? (
                <select
                  value={advanceValue}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAdvanceValue(next);
                    setShowAdvancePicker(false);
                    if (next) onCurrentStageChange(next);
                  }}
                  onBlur={() => setShowAdvancePicker(false)}
                  autoFocus
                  className="vs-advance-select"
                >
                  {stageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 2b. Intake Step Indicator (INTAKE only) ── */}
      {isIntake ? (
        <div className="vs-card vs-intake-step-card">
          <p className="vs-card-label">INTAKE PROGRESS</p>
          <IntakeStepIndicator
            value={intakeStep}
            onSelect={onIntakeStepSave ?? (() => {})}
          />
        </div>
      ) : null}

      {/* ── 3. Two-column layout ── */}
      <div className="vs-two-col">

        {/* Left: context cards + activity */}
        <div className="vs-col-left">

          {/* Company Snapshot (INTAKE only) */}
          {isIntake ? (
            <CompanySnapshotCard
              pipelineCompanyType={pipelineCompanyType}
              fundingStage={fundingStage}
              amountRaising={amountRaising}
              targetCustomer={targetCustomer}
              valueProp={valueProp}
              onPipelineCompanyTypeSave={onPipelineCompanyTypeSave}
              onFundingStageSave={onFundingStageSave}
              onAmountRaisingSave={onAmountRaisingSave}
              onTargetCustomerSave={onTargetCustomerSave}
              onValuePropSave={onValuePropSave}
            />
          ) : null}

          {/* Health System Participation (non-INTAKE) */}
          {!isIntake ? (
            <div className="vs-card">
              <p className="vs-card-label">HEALTH SYSTEM PARTICIPATION</p>
              {healthSystemParticipation.length === 0 ? (
                <div className="vs-hs-empty">
                  <button type="button" className="vs-teal-link vs-hs-link">
                    ＋ Link health system
                  </button>
                  <p className="vs-hs-empty-sub">
                    Health system interest drives Abundant&apos;s screening process
                  </p>
                </div>
              ) : (
                <div className="vs-hs-list">
                  {healthSystemParticipation.map((entry) => (
                    <div key={entry.id} className="vs-hs-row">
                      <span className="vs-hs-name">{entry.name}</span>
                      <div className="vs-hs-badges">
                        {entry.loiStatusLabel ? (
                          <span className="vs-badge vs-badge--amber">{entry.loiStatusLabel}</span>
                        ) : null}
                        {entry.currentInterestLabel ? (
                          <span className="vs-badge vs-badge--teal">{entry.currentInterestLabel}</span>
                        ) : null}
                        {entry.opportunityStageLabel ? (
                          <span className="vs-badge vs-badge--gray">{entry.opportunityStageLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Activity Timeline */}
          <div className="vs-card">
            <p className="vs-card-label">ACTIVITY TIMELINE</p>
            {activityTimeline.length === 0 ? (
              <p className="vs-empty-text">No activity recorded yet</p>
            ) : (
              <div className="vs-timeline">
                {activityTimeline.map((entry, idx) => (
                  <React.Fragment key={entry.id}>
                    <div className="vs-timeline-entry">
                      <div
                        className={`vs-timeline-dot vs-timeline-dot--${getTimelineDotVariant(entry.badge)}`}
                        aria-hidden="true"
                      />
                      <div className="vs-timeline-body">
                        <div className="vs-timeline-top">
                          <strong className="vs-timeline-title">{entry.title}</strong>
                          {entry.badge ? (
                            <span className="vs-badge vs-badge--gray vs-badge--sm">{entry.badge}</span>
                          ) : null}
                          <span className="vs-timeline-ts">{entry.timestampLabel}</span>
                        </div>
                        {entry.description ? (
                          <p className="vs-timeline-desc">{entry.description}</p>
                        ) : null}
                      </div>
                    </div>
                    {idx < activityTimeline.length - 1 ? (
                      <div className="vs-timeline-divider" aria-hidden="true" />
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right sidebar */}
        <div className="vs-col-right">

          {/* Deal Owner */}
          <div className="vs-card vs-sidebar-card">
            <p className="vs-card-label">DEAL OWNER</p>
            <div className="vs-owner-row">
              <div className="vs-avatar" aria-hidden="true">
                {getInitials(ownerName)}
              </div>
              {ownerName ? (
                <span className="vs-owner-name">{ownerName}</span>
              ) : (
                <span className="vs-placeholder-text">Unassigned</span>
              )}
            </div>
          </div>

          {/* Next Step */}
          <div className="vs-card vs-sidebar-card">
            <p className="vs-card-label">NEXT STEP</p>
            {nextStepLabel ? (
              <p className="vs-next-text">{nextStepLabel}</p>
            ) : (
              <p className="vs-placeholder-text">No next step set</p>
            )}
            {nextStepDueLabel && nextStepDueLabel !== "No due date" ? (
              <p className={`vs-due-text${nextStepOverdue ? " vs-due-overdue" : ""}`}>
                Due: {nextStepDueLabel}
              </p>
            ) : null}
          </div>

          {/* Open Tasks */}
          <div className="vs-card vs-sidebar-card">
            <p className="vs-card-label">OPEN TASKS</p>
            {openTasks.length > 0 ? (
              <div className="vs-task-list">
                {openTasks.map((task) => (
                  <div key={task.id} className="vs-task-row">
                    <span className="vs-task-circle" aria-hidden="true" />
                    <div className="vs-task-info">
                      <span className="vs-task-text">{task.title}</span>
                      {task.dueLabel ? (
                        <span className="vs-task-due">{task.dueLabel}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <button type="button" className="vs-teal-link vs-add-link">＋ Add task</button>
          </div>

          {/* S1 Investment */}
          <div className="vs-card vs-sidebar-card">
            <p className="vs-card-label">S1 INVESTMENT</p>
            {s1InvestmentStage ? (
              <p className="vs-sidebar-value">{s1InvestmentStage}</p>
            ) : (
              <p className="vs-placeholder-text">Not started</p>
            )}
          </div>

        </div>
      </div>

      {/* ── 4. Collapsible Settings ── */}
      <div className="vs-settings-section">
        <button
          type="button"
          className="vs-settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          <span className="vs-settings-toggle-label">⚙ Settings</span>
          <span className="vs-settings-chevron" aria-hidden="true">
            {settingsOpen ? "▾" : "›"}
          </span>
        </button>

        {settingsOpen ? (
          <div className="vs-settings-body">

            {/* Status pills */}
            <div className="vs-settings-status-row">
              <span className="vs-settings-field-label">Status</span>
              <div className="vs-status-pills" role="group" aria-label="Status">
                {shouldShowStatusControls ? (
                  statusOptions.map((opt) => {
                    const active = opt.value === statusValue;
                    const variant = getStatusVariant(opt.value);
                    const optId = `${statusRadioGroupId}-${opt.value}`;
                    return (
                      <label
                        key={opt.value}
                        htmlFor={optId}
                        className={`vs-status-pill vs-status-pill--${variant}${active ? " active" : ""}`}
                      >
                        {opt.label}
                        <input
                          id={optId}
                          type="radio"
                          name={statusRadioGroupId}
                          value={opt.value}
                          checked={active}
                          onChange={(e) => {
                            if (e.target.checked) onStatusSave(opt.value);
                          }}
                        />
                      </label>
                    );
                  })
                ) : (
                  statusOptions.map((opt) => {
                    const active = opt.value === statusValue;
                    const variant = getStatusVariant(opt.value);
                    return (
                      <span
                        key={opt.value}
                        className={`vs-status-pill vs-status-pill--${variant}${active ? " active" : ""}`}
                      >
                        {opt.label}
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            {/* Fields grid */}
            <div className="vs-settings-grid">
              <InlineTextField
                label="Pass Reason"
                value={closedReasonValue}
                placeholder={closedReasonPlaceholder}
                listId={reasonListId}
                onSave={onClosedReasonSave}
              />

              {isClosedLostStatus ? (
                <div className="inline-edit-field">
                  <label>Conviction Score</label>
                  <div className="vs-settings-readonly">0</div>
                </div>
              ) : (
                <InlineTextField
                  inputType="number"
                  label="Conviction Score"
                  value={likelihoodValue}
                  emptyText="0–100"
                  onSave={onLikelihoodSave}
                />
              )}

              <InlineTextField
                inputType="date"
                label="Estimated Close Date"
                value={estimatedCloseDate}
                dateDebugContext={estimatedCloseDateDebugContext}
                onSave={onEstimatedCloseDateSave}
              />

              <div className="inline-edit-field">
                <label>Closed Date</label>
                <div className="vs-settings-readonly">{closedDateDisplay || "—"}</div>
              </div>

              <div className="inline-edit-field">
                <label>Created Date</label>
                <div className="vs-settings-readonly">{createdDate || "—"}</div>
              </div>

              <InlineTextField
                inputType="date"
                label="Intake Decision Date"
                value={intakeDecisionDate}
                dateDebugContext={intakeDecisionDateDebugContext}
                onSave={onIntakeDecisionDateSave}
              />

              <InlineTextField
                inputType="date"
                label="Studio Contract Executed"
                value={ventureStudioContractExecutedDate}
                dateDebugContext={ventureStudioContractExecutedDateDebugContext}
                onSave={onVentureStudioContractExecutedDateSave}
              />

              {showScreeningWebinars ? (
                <>
                  <InlineTextField
                    inputType="date"
                    label="Screening Webinar Date 1"
                    value={screeningWebinarDate1}
                    dateDebugContext={screeningWebinarDate1DebugContext}
                    onSave={onScreeningWebinarDate1Save}
                  />
                  <InlineTextField
                    inputType="date"
                    label="Screening Webinar Date 2"
                    value={screeningWebinarDate2}
                    dateDebugContext={screeningWebinarDate2DebugContext}
                    onSave={onScreeningWebinarDate2Save}
                  />
                </>
              ) : null}
            </div>

          </div>
        ) : null}
      </div>

      <datalist id={reasonListId}>
        {reasonSuggestions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}
