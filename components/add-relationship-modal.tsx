"use client";

import * as React from "react";

type AddRelationshipModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitDisabled?: boolean;
  title: string;
  subtitle?: string;
  submitLabel: string;
  children: React.ReactNode;
};

export function AddRelationshipModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  title,
  subtitle,
    submitLabel,
    submitDisabled,
  children
}: AddRelationshipModalProps) {
  React.useEffect(() => {
    if (!open || isSubmitting) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  function closeModal() {
    if (isSubmitting) return;
    onClose();
  }

  return (
    <div className="entity-add-backdrop" onMouseDown={closeModal}>
      <div
        className="entity-add-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="entity-add-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="modal-icon-close"
            onClick={closeModal}
            disabled={isSubmitting}
            aria-label="Close dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {children}

        <div className="actions">
          <button
            className="primary"
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || submitDisabled}
          >
            {isSubmitting ? "Adding..." : submitLabel}
          </button>
          <button className="ghost small" type="button" onClick={closeModal} disabled={isSubmitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
