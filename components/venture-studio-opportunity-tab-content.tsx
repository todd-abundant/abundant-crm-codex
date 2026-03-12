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
  onOwnerSave: (value: string) => void;
  createdDate: string;
  onCreatedDateSave: (value: string) => void;
  activePipelineColumn: string | null;
  stageOptions: StageOption[];
  onCurrentStageChange: (value: string) => void;
  pipelinePhaseLabel: string;
  showStatusControls: boolean;
  statusValue: string;
  statusOptions: StatusOption[];
  onStatusSave: (value: string) => void;
  statusReadOnlyLabel: string;
  showOutcomeReason: boolean;
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
  onOwnerSave,
  createdDate,
  onCreatedDateSave,
  activePipelineColumn,
  stageOptions,
  onCurrentStageChange,
  pipelinePhaseLabel,
  showStatusControls,
  statusValue,
  statusOptions,
  onStatusSave,
  statusReadOnlyLabel,
  showOutcomeReason,
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
  return (
    <div className="venture-studio-opportunity-tab-content">
      <div className="detail-section company-pipeline-main-section">
      <div className="detail-grid">
          <InlineTextField
            label={ownerLabel}
            value={ownerName}
            emptyText="Unassigned"
            onSave={onOwnerSave}
            inputType="text"
          />
          <InlineTextField
            inputType="date"
            label="Created Date"
            value={createdDate}
            emptyText="Not set"
            onSave={onCreatedDateSave}
          />

          {activePipelineColumn ? (
            <InlineSelectField
              label="Current Stage"
              value={activePipelineColumn}
              options={stageOptions}
              blurOnChange
              onSave={onCurrentStageChange}
            />
          ) : (
            <div className="inline-edit-field pipeline-status-readonly-field">
              <label>Current Stage</label>
              <div className="pipeline-status-readonly-value">Closed / Inactive</div>
            </div>
          )}

          <div className="inline-edit-field pipeline-status-readonly-field">
            <label>Pipeline Phase</label>
            <div className="pipeline-status-readonly-value">{pipelinePhaseLabel || "Not set"}</div>
          </div>

          {showStatusControls ? (
            <>
              <InlineSelectField
                label="Status"
                value={statusValue}
                options={statusOptions}
                blurOnChange
                onSave={onStatusSave}
              />
              {showOutcomeReason ? (
                <InlineTextField
                  label={closedReasonLabel}
                  value={closedReasonValue}
                  placeholder={closedReasonPlaceholder}
                  listId={reasonListId}
                  onSave={onClosedReasonSave}
                />
              ) : null}
            </>
          ) : (
            <div className="inline-edit-field pipeline-status-readonly-field">
              <label>Status</label>
              <div className="pipeline-status-readonly-value">{statusReadOnlyLabel}</div>
            </div>
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
