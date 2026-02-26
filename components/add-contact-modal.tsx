"use client";

import * as React from "react";

type ContactRoleOption = {
  value: string;
  label: string;
};

type AddContactModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  addingContact: boolean;
  contactName: string;
  onContactNameChange: (value: string) => void;
  contactRoleType: string;
  onContactRoleTypeChange: (value: string) => void;
  roleOptions: ContactRoleOption[];
  contactTitle: string;
  onContactTitleChange: (value: string) => void;
  contactRelationshipTitle: string;
  onContactRelationshipTitleChange: (value: string) => void;
  contactEmail: string;
  onContactEmailChange: (value: string) => void;
  contactPhone: string;
  onContactPhoneChange: (value: string) => void;
  contactLinkedinUrl: string;
  onContactLinkedinUrlChange: (value: string) => void;
  namePlaceholder: string;
  titlePlaceholder: string;
  relationshipTitlePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  linkedinPlaceholder: string;
};

export function AddContactModal({
  open,
  onClose,
  onSubmit,
  addingContact,
  contactName,
  onContactNameChange,
  contactRoleType,
  onContactRoleTypeChange,
  roleOptions,
  contactTitle,
  onContactTitleChange,
  contactRelationshipTitle,
  onContactRelationshipTitleChange,
  contactEmail,
  onContactEmailChange,
  contactPhone,
  onContactPhoneChange,
  contactLinkedinUrl,
  onContactLinkedinUrlChange,
  namePlaceholder,
  titlePlaceholder,
  relationshipTitlePlaceholder,
  emailPlaceholder,
  phonePlaceholder,
  linkedinPlaceholder
}: AddContactModalProps) {
  React.useEffect(() => {
    if (!open || addingContact) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, addingContact, onClose]);

  if (!open) return null;

  function closeModal() {
    if (addingContact) return;
    onClose();
  }

  return (
    <div className="entity-add-backdrop" onMouseDown={closeModal}>
      <div
        className="entity-add-modal contact-add-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add contact"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="entity-add-header">
          <div>
            <h3>Add Contact</h3>
            <p className="muted">Capture contact details, then save to link this person to the selected record.</p>
          </div>
          <button
            type="button"
            className="modal-icon-close"
            onClick={closeModal}
            disabled={addingContact}
            aria-label="Close add contact dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="detail-grid">
          <div>
            <label>Contact Name</label>
            <input
              value={contactName}
              onChange={(event) => onContactNameChange(event.target.value)}
              placeholder={namePlaceholder}
              autoFocus
            />
          </div>
          <div>
            <label>Role Type</label>
            <select value={contactRoleType} onChange={(event) => onContactRoleTypeChange(event.target.value)}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Contact Title</label>
            <input
              value={contactTitle}
              onChange={(event) => onContactTitleChange(event.target.value)}
              placeholder={titlePlaceholder}
            />
          </div>
          <div>
            <label>Relationship Title</label>
            <input
              value={contactRelationshipTitle}
              onChange={(event) => onContactRelationshipTitleChange(event.target.value)}
              placeholder={relationshipTitlePlaceholder}
            />
          </div>
          <div>
            <label>Email</label>
            <input
              value={contactEmail}
              onChange={(event) => onContactEmailChange(event.target.value)}
              placeholder={emailPlaceholder}
            />
          </div>
          <div>
            <label>Phone</label>
            <input
              value={contactPhone}
              onChange={(event) => onContactPhoneChange(event.target.value)}
              placeholder={phonePlaceholder}
            />
          </div>
          <div>
            <label>LinkedIn URL</label>
            <input
              value={contactLinkedinUrl}
              onChange={(event) => onContactLinkedinUrlChange(event.target.value)}
              placeholder={linkedinPlaceholder}
            />
          </div>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={onSubmit} disabled={addingContact}>
            {addingContact ? "Adding..." : "Add Contact"}
          </button>
          <button type="button" className="ghost small" onClick={closeModal} disabled={addingContact}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
