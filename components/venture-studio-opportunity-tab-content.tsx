"use client";

import * as React from "react";
import { InlineSelectField, InlineTextField } from "./inline-detail-field";

type StatusOption = {
  value: string;
  label: string;
};

type StageOption = {
  value: string;
  label: string;
};

type DateDebugContext = string | Record<string, unknown>;

type VentureStudioOpportunityTabContentProps = {
  ownerLabel: string;
  ownerName: string;
  createdDate: string;
  activePipelineColumn: string | null;
  currentFocusLabel: string;
  stageOptions: StageOption[];
  onCurrentStageChange: (value: string) => void;
  pipelineStepLabel: string;
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
};

export function VentureStudioOpportunityTabContent({
  ownerLabel,
  ownerName,
  createdDate,
  activePipelineColumn,
  currentFocusLabel,
  stageOptions,
  onCurrentStageChange,
  pipelineStepLabel,
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
}: VentureStudioOpportunityTabContentProps) {
  const statusRadioGroupId = React.useId();
  const isClosedStatusValue = statusValue === "CLOSED_LOST" || statusValue === "CLOSED_REVISIT";
  const shouldShowStatusControls = showStatusControls || isClosedStatusValue;
  const showClosedReasonField = Boolean(closedReasonValue.trim());
  const focusDisplayLabel = activePipelineColumn ? currentFocusLabel : "Closed / Inactive";

  return (
    <div className="venture-studio-opportunity-tab-content">
      <div className="detail-section venture-stage-summary">
        <div className="venture-stage-summary-card">
          <p className="detail-label">Current Focus</p>
          <div className="venture-stage-summary-value">{focusDisplayLabel}</div>
        </div>
        <div className="venture-stage-summary-card">
          <p className="detail-label">Detailed Step</p>
          <div className="venture-stage-summary-value">{pipelineStepLabel || "Not set"}</div>
        </div>
        <div className="venture-stage-summary-card">
          <p className="detail-label">Status</p>
          <div className="venture-stage-summary-value">{statusReadOnlyLabel}</div>
        </div>
      </div>
      <div className="detail-section company-pipeline-main-section">
        <div className="detail-grid">
          <div className="inline-edit-field pipeline-status-readonly-field">
            <label>{ownerLabel}</label>
            <div className="pipeline-status-readonly-value">{ownerName || "Unassigned"}</div>
          </div>
          <div className="inline-edit-field pipeline-status-readonly-field">
            <label>Created Date</label>
            <div className="pipeline-status-readonly-value">{createdDate || "Not set"}</div>
          </div>

          {activePipelineColumn ? (
            <InlineSelectField
              label="Move Company To"
              value={activePipelineColumn}
              options={stageOptions}
              blurOnChange
              onSave={onCurrentStageChange}
            />
          ) : (
            <div className="inline-edit-field pipeline-status-readonly-field">
              <label>Move Company To</label>
              <div className="pipeline-status-readonly-value">Closed / Inactive</div>
            </div>
          )}

          <div className="inline-edit-field pipeline-status-readonly-field">
            <label>Detailed Step</label>
            <div className="pipeline-status-readonly-value">{pipelineStepLabel || "Not set"}</div>
          </div>

          {shouldShowStatusControls ? (
            <>
              <div className="inline-edit-field">
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
            <div className="inline-edit-field pipeline-status-readonly-field">
              <label>Status</label>
              <div className="pipeline-status-readonly-value">{statusReadOnlyLabel}</div>
            </div>
          )}

          {!shouldShowStatusControls ? (
            <div className="inline-edit-field pipeline-status-readonly-field">
              <label>{closedReasonLabel}</label>
              <div className="pipeline-status-readonly-value">
                {showClosedReasonField ? closedReasonValue : "Not set"}
              </div>
            </div>
          ) : null}

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
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-label">Milestones</p>
        <div className="detail-grid">
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
        </div>
      </div>

      <datalist id={reasonListId}>
        {reasonSuggestions.map((reason) => (
          <option key={reason} value={reason} />
        ))}
      </datalist>
    </div>
  );
}
