"use client";

import * as React from "react";
import { AddContactModal } from "./add-contact-modal";
import { getJsonErrorMessage, readJsonResponse } from "@/lib/http-response";

type StatusMessage = { kind: "ok" | "error"; text: string };

type HealthSystemContactLink = {
  id: string;
  roleType: "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER";
  title: string | null;
  isKeyAllianceContact: boolean;
  isInformedAllianceContact: boolean;
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
  };
};

type HealthSystemContactsPaneProps = {
  healthSystemId: string;
  onStatus?: (status: StatusMessage | null) => void;
};

function contactNameParts(name: string) {
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return { firstName: "", lastName: "", displayName: "" };
  if (nameParts.length === 1) {
    return { firstName: "", lastName: nameParts[0], displayName: nameParts[0] };
  }

  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(" ");
  return {
    firstName,
    lastName,
    displayName: `${lastName}, ${firstName}`
  };
}

export function HealthSystemContactsPane({ healthSystemId, onStatus }: HealthSystemContactsPaneProps) {
  const [links, setLinks] = React.useState<HealthSystemContactLink[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [addContactModalOpen, setAddContactModalOpen] = React.useState(false);
  const [addingContact, setAddingContact] = React.useState(false);
  const [contactName, setContactName] = React.useState("");
  const [contactTitle, setContactTitle] = React.useState("");
  const [contactRelationshipTitle, setContactRelationshipTitle] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactLinkedinUrl, setContactLinkedinUrl] = React.useState("");
  const [contactRoleType, setContactRoleType] = React.useState<"EXECUTIVE" | "VENTURE_PARTNER" | "OTHER">(
    "EXECUTIVE"
  );
  const [newIsKeyAllianceContact, setNewIsKeyAllianceContact] = React.useState(false);
  const [newIsInformedAllianceContact, setNewIsInformedAllianceContact] = React.useState(false);

  const [editingContactLinkId, setEditingContactLinkId] = React.useState<string | null>(null);
  const [editingContactName, setEditingContactName] = React.useState("");
  const [editingContactTitle, setEditingContactTitle] = React.useState("");
  const [editingContactRelationshipTitle, setEditingContactRelationshipTitle] = React.useState("");
  const [editingContactEmail, setEditingContactEmail] = React.useState("");
  const [editingContactPhone, setEditingContactPhone] = React.useState("");
  const [editingContactLinkedinUrl, setEditingContactLinkedinUrl] = React.useState("");
  const [editingContactRoleType, setEditingContactRoleType] = React.useState<
    "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER"
  >("EXECUTIVE");
  const [editingIsKeyAllianceContact, setEditingIsKeyAllianceContact] = React.useState(false);
  const [editingIsInformedAllianceContact, setEditingIsInformedAllianceContact] = React.useState(false);
  const [updatingContact, setUpdatingContact] = React.useState(false);
  const [deletingContactLinkId, setDeletingContactLinkId] = React.useState<string | null>(null);

  const endpoint = React.useMemo(() => `/api/health-systems/${healthSystemId}/contacts`, [healthSystemId]);

  const resetContactForm = React.useCallback(() => {
    setContactName("");
    setContactTitle("");
    setContactRelationshipTitle("");
    setContactEmail("");
    setContactPhone("");
    setContactLinkedinUrl("");
    setContactRoleType("EXECUTIVE");
    setNewIsKeyAllianceContact(false);
    setNewIsInformedAllianceContact(false);
  }, []);

  const resetEditingContactForm = React.useCallback(() => {
    setEditingContactLinkId(null);
    setEditingContactName("");
    setEditingContactTitle("");
    setEditingContactRelationshipTitle("");
    setEditingContactEmail("");
    setEditingContactPhone("");
    setEditingContactLinkedinUrl("");
    setEditingContactRoleType("EXECUTIVE");
    setEditingIsKeyAllianceContact(false);
    setEditingIsInformedAllianceContact(false);
  }, []);

  const loadLinks = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to load health system contacts."));
      }

      const nextLinks = Array.isArray(payload.links) ? (payload.links as HealthSystemContactLink[]) : [];
      setLinks(nextLinks);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load health system contacts.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    setAddContactModalOpen(false);
    resetContactForm();
    resetEditingContactForm();
    void loadLinks();
  }, [healthSystemId, loadLinks, resetContactForm, resetEditingContactForm]);

  async function addContact() {
    if (!contactName.trim()) {
      onStatus?.({ kind: "error", text: "Contact name is required." });
      return;
    }

    setAddingContact(true);
    onStatus?.(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          title: contactTitle,
          relationshipTitle: contactRelationshipTitle,
          email: contactEmail,
          phone: contactPhone,
          linkedinUrl: contactLinkedinUrl,
          roleType: contactRoleType,
          isKeyAllianceContact: newIsKeyAllianceContact,
          isInformedAllianceContact: newIsInformedAllianceContact
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to add contact."));
      }

      resetContactForm();
      setAddContactModalOpen(false);
      await loadLinks();
      const createdContact =
        typeof payload.contact === "object" && payload.contact
          ? (payload.contact as { name?: unknown })
          : null;
      const addedName = typeof createdContact?.name === "string" ? createdContact.name : "Contact";
      onStatus?.({ kind: "ok", text: `${addedName} linked.` });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to add contact."
      });
    } finally {
      setAddingContact(false);
    }
  }

  function beginEditingContact(link: HealthSystemContactLink) {
    setEditingContactLinkId(link.id);
    setEditingContactName(link.contact.name);
    setEditingContactTitle(link.contact.title || "");
    setEditingContactRelationshipTitle(link.title || link.contact.title || "");
    setEditingContactEmail(link.contact.email || "");
    setEditingContactPhone(link.contact.phone || "");
    setEditingContactLinkedinUrl(link.contact.linkedinUrl || "");
    setEditingContactRoleType(link.roleType === "EXECUTIVE" || link.roleType === "VENTURE_PARTNER" ? link.roleType : "OTHER");
    setEditingIsKeyAllianceContact(Boolean(link.isKeyAllianceContact));
    setEditingIsInformedAllianceContact(Boolean(link.isInformedAllianceContact));
    onStatus?.(null);
  }

  async function updateContact(linkId: string) {
    if (!editingContactName.trim()) {
      onStatus?.({ kind: "error", text: "Contact name is required." });
      return;
    }

    setUpdatingContact(true);
    onStatus?.(null);

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          name: editingContactName,
          title: editingContactTitle,
          relationshipTitle: editingContactRelationshipTitle,
          email: editingContactEmail,
          phone: editingContactPhone,
          linkedinUrl: editingContactLinkedinUrl,
          roleType: editingContactRoleType,
          isKeyAllianceContact: editingIsKeyAllianceContact,
          isInformedAllianceContact: editingIsInformedAllianceContact
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to update contact."));
      }

      resetEditingContactForm();
      await loadLinks();
      onStatus?.({ kind: "ok", text: `${editingContactName} updated.` });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to update contact."
      });
    } finally {
      setUpdatingContact(false);
    }
  }

  async function deleteContact(linkId: string, contactNameToDelete: string) {
    const confirmDelete = window.confirm(`Remove ${contactNameToDelete} from this health system?`);
    if (!confirmDelete) return;

    setDeletingContactLinkId(linkId);
    onStatus?.(null);

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to remove contact."));
      }

      if (editingContactLinkId === linkId) {
        resetEditingContactForm();
      }
      await loadLinks();
      onStatus?.({ kind: "ok", text: `${contactNameToDelete} removed.` });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to remove contact."
      });
    } finally {
      setDeletingContactLinkId(null);
    }
  }

  const sortedLinks = React.useMemo(() => {
    return [...links].sort((left, right) => {
      const leftName = contactNameParts(left.contact.name);
      const rightName = contactNameParts(right.contact.name);
      const byLast = leftName.lastName.localeCompare(rightName.lastName);
      if (byLast !== 0) return byLast;
      const byFirst = leftName.firstName.localeCompare(rightName.firstName);
      if (byFirst !== 0) return byFirst;
      return left.contact.name.localeCompare(right.contact.name);
    });
  }, [links]);

  return (
    <div className="detail-section">
      <p className="detail-label">Related Contacts</p>
      <div className="actions actions-flush">
        <button
          type="button"
          className="ghost small contact-add-link"
          onClick={() => {
            onStatus?.(null);
            setAddContactModalOpen(true);
          }}
        >
          Add Contact
        </button>
      </div>

      {loading ? <p className="muted">Loading contacts...</p> : null}
      {!loading && error ? <p className="status error">{error}</p> : null}
      {!loading && !error && sortedLinks.length === 0 ? <p className="muted">No contacts linked yet.</p> : null}

      {!loading && !error
        ? sortedLinks.map((link) => (
            <div key={link.id} className="detail-list-item">
              {editingContactLinkId === link.id ? (
                <div className="detail-card">
                  <div className="detail-grid">
                    <div>
                      <label>Contact Name</label>
                      <input
                        value={editingContactName}
                        onChange={(event) => setEditingContactName(event.target.value)}
                        placeholder="William Smith"
                      />
                    </div>
                    <div>
                      <label>Role Type</label>
                      <select
                        value={editingContactRoleType}
                        onChange={(event) =>
                          setEditingContactRoleType(event.target.value as "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER")
                        }
                      >
                        <option value="EXECUTIVE">Executive</option>
                        <option value="VENTURE_PARTNER">Venture Partner</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label>Contact Title</label>
                      <input
                        value={editingContactTitle}
                        onChange={(event) => setEditingContactTitle(event.target.value)}
                        placeholder="Chief Innovation Officer"
                      />
                    </div>
                    <div>
                      <label>Relationship Title</label>
                      <input
                        value={editingContactRelationshipTitle}
                        onChange={(event) => setEditingContactRelationshipTitle(event.target.value)}
                        placeholder="Board Observer"
                      />
                    </div>
                    <div>
                      <label>Email</label>
                      <input
                        value={editingContactEmail}
                        onChange={(event) => setEditingContactEmail(event.target.value)}
                        placeholder="name@org.com"
                      />
                    </div>
                    <div>
                      <label>Phone</label>
                      <input
                        value={editingContactPhone}
                        onChange={(event) => setEditingContactPhone(event.target.value)}
                        placeholder="+1 555 555 5555"
                      />
                    </div>
                    <div>
                      <label>LinkedIn URL</label>
                      <input
                        value={editingContactLinkedinUrl}
                        onChange={(event) => setEditingContactLinkedinUrl(event.target.value)}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                    <div className="inline-edit-field">
                      <label>Key Alliance Contact</label>
                      <input
                        type="checkbox"
                        checked={editingIsKeyAllianceContact}
                        onChange={(event) => setEditingIsKeyAllianceContact(event.target.checked)}
                      />
                    </div>
                    <div className="inline-edit-field">
                      <label>Informed Alliance Contact</label>
                      <input
                        type="checkbox"
                        checked={editingIsInformedAllianceContact}
                        onChange={(event) => setEditingIsInformedAllianceContact(event.target.checked)}
                      />
                    </div>
                  </div>
                  <div className="actions">
                    <button type="button" className="primary" onClick={() => void updateContact(link.id)} disabled={updatingContact}>
                      {updatingContact ? "Saving..." : "Save Contact"}
                    </button>
                    <button type="button" className="ghost small" onClick={resetEditingContactForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="contact-row">
                  <div className="contact-row-details">
                    <strong>{contactNameParts(link.contact.name).displayName}</strong>
                    {link.title ? `, ${link.title}` : link.contact.title ? `, ${link.contact.title}` : ""}
                    {link.contact.email ? ` | ${link.contact.email}` : ""}
                    {link.contact.phone ? ` | ${link.contact.phone}` : ""}
                    {link.contact.linkedinUrl ? (
                      <>
                        {" "}
                        -{" "}
                        <a href={link.contact.linkedinUrl} target="_blank" rel="noreferrer">
                          profile
                        </a>
                      </>
                    ) : null}
                    {link.isKeyAllianceContact || link.isInformedAllianceContact ? (
                      <div className="contact-list-inline-flags">
                        {link.isKeyAllianceContact ? <span className="flag-pill">Key Alliance Contact</span> : null}
                        {link.isInformedAllianceContact ? <span className="flag-pill">Informed Alliance Contact</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="contact-row-actions">
                    <button type="button" className="ghost small" onClick={() => beginEditingContact(link)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => void deleteContact(link.id, link.contact.name)}
                      disabled={deletingContactLinkId === link.id}
                    >
                      {deletingContactLinkId === link.id ? "Removing..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        : null}

      <AddContactModal
        open={addContactModalOpen}
        onClose={() => setAddContactModalOpen(false)}
        onSubmit={() => void addContact()}
        addingContact={addingContact}
        contactName={contactName}
        onContactNameChange={setContactName}
        contactRoleType={contactRoleType}
        onContactRoleTypeChange={(value) => setContactRoleType(value as "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER")}
        roleOptions={[
          { value: "EXECUTIVE", label: "Executive" },
          { value: "VENTURE_PARTNER", label: "Venture Partner" },
          { value: "OTHER", label: "Other" }
        ]}
        contactTitle={contactTitle}
        onContactTitleChange={setContactTitle}
        contactRelationshipTitle={contactRelationshipTitle}
        onContactRelationshipTitleChange={setContactRelationshipTitle}
        contactEmail={contactEmail}
        onContactEmailChange={setContactEmail}
        contactPhone={contactPhone}
        onContactPhoneChange={setContactPhone}
        contactLinkedinUrl={contactLinkedinUrl}
        onContactLinkedinUrlChange={setContactLinkedinUrl}
        contactIsKeyAllianceContact={newIsKeyAllianceContact}
        onContactIsKeyAllianceContactChange={setNewIsKeyAllianceContact}
        contactIsInformedAllianceContact={newIsInformedAllianceContact}
        onContactIsInformedAllianceContactChange={setNewIsInformedAllianceContact}
        namePlaceholder="William Smith"
        titlePlaceholder="Chief Innovation Officer"
        relationshipTitlePlaceholder="Board Observer"
        emailPlaceholder="name@org.com"
        phonePlaceholder="+1 555 555 5555"
        linkedinPlaceholder="https://linkedin.com/in/..."
      />
    </div>
  );
}
