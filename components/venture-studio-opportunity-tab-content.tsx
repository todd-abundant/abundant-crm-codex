"use client";

import * as React from "react";
import { InlineTextField } from "./inline-detail-field";
import {
  LeadSourceEntityPicker,
  LEAD_SOURCE_TYPE_OPTIONS,
  type EntitySearchResult
} from "./company-pipeline-manager";

type StatusOption = {
  value: string;
  label: string;
};

type StageOption = {
  value: string;
  label: string;
};

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
  openTasks?: OpenTaskItem[];
  activityTimeline?: ActivityTimelineItem[];
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
};

function summaryValue(value: string | null | undefined, fallback: string) {
  const trimmed = (value || "").trim();
  return trimmed || fallback;
}

export function VentureStudioOpportunityTabContent({
  companyName = "Company",
  location = "",
  ownerLabel,
  ownerName,
  createdDate,
  activePipelineColumn,
  currentFocusLabel,
  lastActivityLabel = "Date unavailable",
  daysInStageLabel = "Stage age unavailable",
  stageOptions,
  onCurrentStageChange,
  isMovingStage = false,
  pipelineStepLabel,
  healthSystemParticipation = [],
  nextStepLabel = "",
  nextStepDueLabel = "No due date",
  openTasks = [],
  activityTimeline = [],
  showStatusControls,
  statusValue,
  statusOptions,
  onStatusSave,
  statusReadOnlyLabel,
  closedReasonLabel,
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
  onLeadSourceEntityClear
}: VentureStudioOpportunityTabContentProps) {
  const statusRadioGroupId = React.useId();
  const [showMoveStagePicker, setShowMoveStagePicker] = React.useState(false);
  const [moveStageValue, setMoveStageValue] = React.useState(activePipelineColumn || stageOptions[0]?.value || "");
  const isClosedStatusValue = statusValue === "CLOSED_LOST" || statusValue === "CLOSED_REVISIT";
  const shouldShowStatusControls = showStatusControls || isClosedStatusValue;
  const showClosedReasonField = Boolean(closedReasonValue.trim());
  const focusDisplayLabel = activePipelineColumn ? currentFocusLabel : "Closed / Inactive";

  React.useEffect(() => {
    setMoveStageValue(activePipelineColumn || stageOptions[0]?.value || "");
  }, [activePipelineColumn, stageOptions]);

  return (
    <div className="venture-studio-opportunity-tab-content venture-meeting-layout">
      <section className="detail-section venture-meeting-header">
        <div>
          <h2>{companyName}</h2>
          <p className="muted venture-meeting-location">{summaryValue(location, "Location unavailable")}</p>
        </div>
        <div className="venture-meeting-header-actions">
          <span className="venture-focus-badge">{focusDisplayLabel}</span>
          {stageOptions.length > 0 ? (
            <div className="venture-stage-action">
              <button
                type="button"
                className="secondary small"
                onClick={() => setShowMoveStagePicker((current) => !current)}
                disabled={isMovingStage}
              >
                {isMovingStage ? "Moving..." : "Move Company To"}
              </button>
              {showMoveStagePicker ? (
                <select
                  value={moveStageValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setMoveStageValue(nextValue);
                    setShowMoveStagePicker(false);
                    if (nextValue) {
                      onCurrentStageChange(nextValue);
                    }
                  }}
                  onBlur={() => setShowMoveStagePicker(false)}
                  autoFocus
                >
                  {stageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="detail-section venture-stage-summary venture-stage-summary--meeting">
        <div className="venture-stage-summary-card">
          <p className="detail-label">Current Focus</p>
          <div className="venture-stage-summary-value">{focusDisplayLabel}</div>
        </div>
        <div className="venture-stage-summary-card">
          <p className="detail-label">Detailed Step</p>
          <div className="venture-stage-summary-value">{summaryValue(pipelineStepLabel, "Not set")}</div>
        </div>
        <div className="venture-stage-summary-card">
          <p className="detail-label">{ownerLabel}</p>
          <div className="venture-stage-summary-value">{summaryValue(ownerName, "Unassigned")}</div>
        </div>
        <div className="venture-stage-summary-card">
          <p className="detail-label">Last Activity</p>
          <div className="venture-stage-summary-value">{summaryValue(lastActivityLabel, "Date unavailable")}</div>
        </div>
        <div className="venture-stage-summary-card">
          <p className="detail-label">Days in Stage</p>
          <div className="venture-stage-summary-value">{summaryValue(daysInStageLabel, "Stage age unavailable")}</div>
        </div>
      </section>

      <section className="detail-section venture-meeting-section">
        <div className="venture-section-head">
          <div>
            <p className="detail-label">Health System Participation</p>
            <p className="muted">Linked health systems, current posture, and LOI context.</p>
          </div>
        </div>
        {healthSystemParticipation.length === 0 ? (
          <p className="muted">No linked health systems yet.</p>
        ) : (
          <div className="venture-health-system-grid">
            {healthSystemParticipation.map((entry) => (
              <article key={entry.id} className="venture-health-system-card">
                <div className="venture-health-system-card-head">
                  <h3>{entry.name}</h3>
                  <span className="status-pill draft">{entry.loiStatusLabel}</span>
                </div>
                <div className="venture-health-system-meta">
                  <span>{entry.currentInterestLabel}</span>
                  <span>{entry.opportunityStageLabel}</span>
                  <span>{entry.updatedAtLabel}</span>
                </div>
                <p><strong>Status update:</strong> {summaryValue(entry.statusUpdate, "No status update yet")}</p>
                <p><strong>Member feedback:</strong> {summaryValue(entry.memberFeedbackStatus, "No member feedback yet")}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="detail-section venture-meeting-section">
        <div className="venture-section-head">
          <div>
            <p className="detail-label">Next Step + Open Tasks</p>
            <p className="muted">What the team needs to do next.</p>
          </div>
        </div>
        <div className="venture-next-step-layout">
          <div className="venture-next-step-card">
            <p className="detail-label">Next Step</p>
            <div className="venture-stage-summary-value">{summaryValue(nextStepLabel, "No next step set")}</div>
            <p className="muted">Due: {summaryValue(nextStepDueLabel, "No due date")}</p>
          </div>
          <div className="venture-open-task-list">
            {openTasks.length === 0 ? (
              <p className="muted">No open tasks captured yet.</p>
            ) : (
              openTasks.map((task) => (
                <article key={task.id} className="venture-open-task-card">
                  <strong>{task.title}</strong>
                  <p>{task.detail}</p>
                  <p className="muted">{task.dueLabel}</p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="detail-section venture-meeting-section">
        <div className="venture-section-head">
          <div>
            <p className="detail-label">Activity Timeline</p>
            <p className="muted">Recent notes, meetings, and status changes in reverse chronological order.</p>
          </div>
        </div>
        {activityTimeline.length === 0 ? (
          <p className="muted">No recent activity captured yet.</p>
        ) : (
          <div className="venture-timeline-list">
            {activityTimeline.map((entry) => (
              <article key={entry.id} className="venture-timeline-item">
                <div className="venture-timeline-marker" aria-hidden="true" />
                <div className="venture-timeline-content">
                  <div className="venture-timeline-head">
                    <strong>{entry.title}</strong>
                    {entry.badge ? <span className="status-pill draft">{entry.badge}</span> : null}
                  </div>
                  <p>{summaryValue(entry.description, "No details available")}</p>
                  <p className="muted">{entry.timestampLabel}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="detail-section venture-edit-section">
        <div className="venture-section-head">
          <div>
            <p className="detail-label">Editable Fields</p>
            <p className="muted">Operational settings and milestones live here so the read view above stays clean in meetings.</p>
          </div>
        </div>
        <div className="detail-grid">
          <div className="inline-edit-field pipeline-status-readonly-field">
            <label>Created Date</label>
            <div className="pipeline-status-readonly-value">{createdDate || "Not set"}</div>
          </div>

          {shouldShowStatusControls ? (
            <>
              <div className="inline-edit-field venture-status-control-field">
                <label>Status</label>
                <div className="opportunity-filter-options" role="radiogroup" aria-label="Status">
                  {statusOptions.map((statusOption) => {
                    const selected = statusOption.value === statusValue;
                    const optionId = `${statusRadioGroupId}-${statusOption.value}`;
                    return (
                      <label
                        key={statusOption.value}
                        className={`opportunity-filter-option ${selected ? "active" : ""}`}
                        htmlFor={optionId}
                      >
                        <span>{statusOption.label}</span>
                        <input
                          id={optionId}
                          type="radio"
                          name={statusRadioGroupId}
                          value={statusOption.value}
                          checked={selected}
                          onChange={(event) => {
                            if (event.target.checked) {
                              onStatusSave(statusOption.value);
                            }
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              <InlineTextField
                label={closedReasonLabel}
                value={closedReasonValue}
                placeholder={closedReasonPlaceholder}
                listId={reasonListId}
                onSave={onClosedReasonSave}
              />
            </>
          ) : (
            <>
              <div className="inline-edit-field pipeline-status-readonly-field">
                <label>Status</label>
                <div className="pipeline-status-readonly-value">{statusReadOnlyLabel}</div>
              </div>
              <div className="inline-edit-field pipeline-status-readonly-field">
                <label>{closedReasonLabel}</label>
                <div className="pipeline-status-readonly-value">
                  {showClosedReasonField ? closedReasonValue : "Not set"}
                </div>
              </div>
            </>
          )}

          {isClosedLostStatus ? (
            <div className="inline-edit-field pipeline-status-readonly-field">
              <label>Likelihood to Close (%)</label>
              <div className="pipeline-status-readonly-value">0</div>
            </div>
          ) : (
            <InlineTextField
              inputType="number"
              label="Likelihood to Close (%)"
              value={likelihoodValue}
              emptyText="0-100"
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

          <div className="inline-edit-field pipeline-status-readonly-field">
            <label>Closed Date</label>
            <div className="pipeline-status-readonly-value">{closedDateDisplay}</div>
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
            label="VS Contract Executed"
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

          <div className="inline-edit-field venture-lead-source-type-field">
            <label>Source Type</label>
            <select
              value={leadSourceType}
              onChange={(e) => onLeadSourceTypeSave(e.target.value)}
            >
              {LEAD_SOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-edit-field venture-lead-source-entity-field">
            <label>Source Entity</label>
            <LeadSourceEntityPicker
              entityId={leadSourceEntityId}
              entityType={leadSourceEntityType}
              entityName={leadSourceEntityName}
              onSelect={(result: EntitySearchResult) =>
                onLeadSourceEntitySave(result.id, result.entityType, result.name)
              }
              onClear={onLeadSourceEntityClear}
            />
          </div>
        </div>
      </section>

      <datalist id={reasonListId}>
        {reasonSuggestions.map((reason) => (
          <option key={reason} value={reason} />
        ))}
      </datalist>
    </div>
  );
}
