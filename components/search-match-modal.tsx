"use client";

import React from "react";

type SearchCandidate = {
  name: string;
  website?: string;
  headquartersCity?: string;
  headquartersState?: string;
  headquartersCountry?: string;
};

type ManualCandidate = {
  name: string;
  website: string;
  headquartersCity: string;
  headquartersState: string;
  headquartersCountry: string;
};

type SearchMatchModalProps = {
  isOpen: boolean;
  title: string;
  query: string;
  searching: boolean;
  candidates: SearchCandidate[];
  selectedCandidateIndex: number;
  searchError: string | null;
  onSelectCandidate: (index: number) => void;
  manualCandidate: ManualCandidate;
  manualCandidateEnabled: boolean;
  isManualMode: boolean;
  onManualCandidateChange: (candidate: Partial<ManualCandidate>) => void;
  onCreateManually: () => void;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  submitDisabled: boolean;
};

function formatCandidateLocation(candidate: SearchCandidate) {
  return [candidate.headquartersCity, candidate.headquartersState, candidate.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function onDialogMouseDown(event: React.MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
}

export function SearchMatchModal(props: SearchMatchModalProps) {
  const {
    isOpen,
    title,
    query,
    searching,
    candidates,
    selectedCandidateIndex,
    searchError,
    onSelectCandidate,
    manualCandidate,
    manualCandidateEnabled,
    isManualMode,
    onManualCandidateChange,
    onCreateManually,
    submitLabel,
    onSubmit,
    onClose,
    submitDisabled
  } = props;

  if (!isOpen) return null;

  const hasCandidates = candidates.length > 0;
  const shouldShowManualInputs = isManualMode || (!hasCandidates && manualCandidateEnabled);

  return (
    <div className="search-match-backdrop" onMouseDown={onClose}>
      <div className="search-match-modal" role="dialog" aria-modal="true" onMouseDown={onDialogMouseDown}>
        <header className="search-match-header">
          <div>
            <h3 className="search-match-title">{title}</h3>
            <p className="search-match-subtitle">Match options for "{query}"</p>
          </div>
          <button className="modal-icon-close" type="button" onClick={onClose} aria-label="Close search match dialog">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {searching && (
          <div className="progress-track" role="progressbar" aria-live="polite" aria-busy="true">
            <div className="progress-indicator" />
          </div>
        )}

        <p className="muted">
          {searching
            ? "Searching for possible online matches..."
            : hasCandidates
              ? "Select the best match, or switch to manual entry."
              : "No matches found automatically. Create manually or select from search results."}
        </p>

        {searchError && <p className="status error">{searchError}</p>}

        {hasCandidates && !isManualMode ? (
          <div className="candidate-list candidate-list-modal">
            {candidates.length > 1 && <p className="detail-label">Select a match:</p>}
            {candidates.map((candidate, index) => {
              const isSelected = selectedCandidateIndex === index;
              const location = formatCandidateLocation(candidate);
              return (
                <label
                  key={`${candidate.name}-${candidate.headquartersCity || "unknown"}-${index}`}
                  className={`candidate-option ${isSelected ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="search-match-candidate"
                    checked={isSelected}
                    onChange={() => onSelectCandidate(index)}
                  />
                  <div>
                    <div className="candidate-name">{candidate.name}</div>
                    <div className="candidate-location muted">{location || "Location not identified"}</div>
                    {candidate.website && <div className="candidate-location muted">{candidate.website}</div>}
                  </div>
                </label>
              );
            })}
          </div>
        ) : null}

        {shouldShowManualInputs && (
          <div className="detail-section">
            <p className="detail-label">Create this record manually.</p>
            <label>
              Name
              <input
                value={manualCandidate.name}
                onChange={(event) => onManualCandidateChange({ name: event.target.value })}
                placeholder="Entity name"
              />
            </label>
            <label>
              Website
              <input
                value={manualCandidate.website}
                onChange={(event) => onManualCandidateChange({ website: event.target.value })}
                placeholder="https://example.com"
              />
            </label>
            <div className="row">
              <label>
                HQ City
                <input
                  value={manualCandidate.headquartersCity}
                  onChange={(event) => onManualCandidateChange({ headquartersCity: event.target.value })}
                  placeholder="City"
                />
              </label>
              <label>
                HQ State
                <input
                  value={manualCandidate.headquartersState}
                  onChange={(event) => onManualCandidateChange({ headquartersState: event.target.value })}
                  placeholder="State"
                />
              </label>
            </div>
            <label>
              HQ Country
              <input
                value={manualCandidate.headquartersCountry}
                onChange={(event) => onManualCandidateChange({ headquartersCountry: event.target.value })}
                placeholder="Country"
              />
            </label>
          </div>
        )}

        <div className="actions">
          {!isManualMode && (
            <button className="secondary" type="button" onClick={onCreateManually}>
              Create manually
            </button>
          )}
          <button className="primary" type="button" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
