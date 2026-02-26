"use client";

import * as React from "react";

type EntityPath = "health-systems" | "co-investors" | "companies";

type StatusMessage = { kind: "ok" | "error"; text: string };

type EntityDocument = {
  id: string;
  title: string;
  url: string;
  notes?: string | null;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
};

type EntityDocumentsPaneProps = {
  entityPath: EntityPath;
  entityId: string;
  onStatus?: (status: StatusMessage | null) => void;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US");
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function EntityDocumentsPane({ entityPath, entityId, onStatus }: EntityDocumentsPaneProps) {
  const [documents, setDocuments] = React.useState<EntityDocument[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");
  const [newNotes, setNewNotes] = React.useState("");
  const [newUploadedAt, setNewUploadedAt] = React.useState("");
  const [addingDocument, setAddingDocument] = React.useState(false);

  const [editingDocumentId, setEditingDocumentId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [editingUrl, setEditingUrl] = React.useState("");
  const [editingNotes, setEditingNotes] = React.useState("");
  const [editingUploadedAt, setEditingUploadedAt] = React.useState("");
  const [savingDocumentId, setSavingDocumentId] = React.useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = React.useState<string | null>(null);

  const endpoint = React.useMemo(() => `/api/${entityPath}/${entityId}/documents`, [entityId, entityPath]);

  const resetCreateForm = React.useCallback(() => {
    setShowCreateForm(false);
    setNewTitle("");
    setNewUrl("");
    setNewNotes("");
    setNewUploadedAt("");
  }, []);

  const resetEditingForm = React.useCallback(() => {
    setEditingDocumentId(null);
    setEditingTitle("");
    setEditingUrl("");
    setEditingNotes("");
    setEditingUploadedAt("");
  }, []);

  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to load documents");
      }

      setDocuments(Array.isArray(payload.documents) ? payload.documents : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    resetCreateForm();
    resetEditingForm();
    void loadDocuments();
  }, [entityId, endpoint, loadDocuments, resetCreateForm, resetEditingForm]);

  async function addDocument() {
    if (!newTitle.trim() || !newUrl.trim()) {
      onStatus?.({ kind: "error", text: "Document title and URL are required." });
      return;
    }

    setAddingDocument(true);
    onStatus?.(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          url: newUrl,
          notes: newNotes,
          uploadedAt: newUploadedAt || null
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add document");
      }

      resetCreateForm();
      await loadDocuments();
      onStatus?.({ kind: "ok", text: `${payload.document?.title || "Document"} added.` });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to add document"
      });
    } finally {
      setAddingDocument(false);
    }
  }

  function beginEdit(document: EntityDocument) {
    setEditingDocumentId(document.id);
    setEditingTitle(document.title || "");
    setEditingUrl(document.url || "");
    setEditingNotes(document.notes || "");
    setEditingUploadedAt(toDateInputValue(document.uploadedAt));
  }

  async function saveDocument(documentId: string) {
    if (!editingTitle.trim() || !editingUrl.trim()) {
      onStatus?.({ kind: "error", text: "Document title and URL are required." });
      return;
    }

    setSavingDocumentId(documentId);
    onStatus?.(null);

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          title: editingTitle,
          url: editingUrl,
          notes: editingNotes,
          uploadedAt: editingUploadedAt || null
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update document");
      }

      resetEditingForm();
      await loadDocuments();
      onStatus?.({ kind: "ok", text: `${payload.document?.title || "Document"} updated.` });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to update document"
      });
    } finally {
      setSavingDocumentId(null);
    }
  }

  async function deleteDocument(documentId: string, title: string) {
    const confirmed = window.confirm(`Delete ${title}?`);
    if (!confirmed) return;

    setDeletingDocumentId(documentId);
    onStatus?.(null);

    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete document");
      }

      await loadDocuments();
      onStatus?.({ kind: "ok", text: `${title} deleted.` });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to delete document"
      });
    } finally {
      setDeletingDocumentId(null);
    }
  }

  return (
    <div className="detail-section">
      <p className="detail-label">Documents</p>

      {loading ? <p className="muted">Loading documents...</p> : null}
      {!loading && error ? <p className="status error">{error}</p> : null}

      {!loading && !error && documents.length === 0 ? <p className="muted">No documents yet.</p> : null}

      {!loading && !error
        ? documents.map((document) => (
            <div key={document.id} className="detail-list-item">
              {editingDocumentId === document.id ? (
                <div className="detail-card">
                  <div className="detail-grid">
                    <div>
                      <label>Title</label>
                      <input
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        placeholder="Document title"
                      />
                    </div>
                    <div>
                      <label>URL</label>
                      <input
                        value={editingUrl}
                        onChange={(event) => setEditingUrl(event.target.value)}
                        placeholder="https://example.com/document"
                      />
                    </div>
                    <div>
                      <label>Uploaded Date</label>
                      <input
                        type="date"
                        value={editingUploadedAt}
                        onChange={(event) => setEditingUploadedAt(event.target.value)}
                      />
                    </div>
                    <div>
                      <label>Notes</label>
                      <input
                        value={editingNotes}
                        onChange={(event) => setEditingNotes(event.target.value)}
                        placeholder="Optional context"
                      />
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void saveDocument(document.id)}
                      disabled={savingDocumentId === document.id}
                    >
                      {savingDocumentId === document.id ? "Saving..." : "Save Document"}
                    </button>
                    <button type="button" className="ghost small" onClick={resetEditingForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="contact-row">
                  <div className="contact-row-details">
                    <strong>
                      <a href={document.url} target="_blank" rel="noreferrer">
                        {document.title}
                      </a>
                    </strong>
                    <p className="muted">Uploaded {formatDate(document.uploadedAt)}</p>
                    {document.notes ? <p>{document.notes}</p> : null}
                  </div>
                  <div className="contact-row-actions">
                    <button type="button" className="ghost small" onClick={() => beginEdit(document)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => void deleteDocument(document.id, document.title)}
                      disabled={deletingDocumentId === document.id}
                    >
                      {deletingDocumentId === document.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        : null}

      {showCreateForm ? (
        <div className="detail-card" style={{ marginTop: 12 }}>
          <div className="detail-grid">
            <div>
              <label>Title</label>
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Document title"
              />
            </div>
            <div>
              <label>URL</label>
              <input
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                placeholder="https://example.com/document"
              />
            </div>
            <div>
              <label>Uploaded Date</label>
              <input
                type="date"
                value={newUploadedAt}
                onChange={(event) => setNewUploadedAt(event.target.value)}
              />
            </div>
            <div>
              <label>Notes</label>
              <input
                value={newNotes}
                onChange={(event) => setNewNotes(event.target.value)}
                placeholder="Optional context"
              />
            </div>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => void addDocument()} disabled={addingDocument}>
              {addingDocument ? "Adding..." : "Add Document"}
            </button>
            <button type="button" className="ghost small" onClick={resetCreateForm}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="ghost small contact-add-link"
            onClick={() => {
              onStatus?.(null);
              setShowCreateForm(true);
            }}
          >
            Add Document
          </button>
        </div>
      )}
    </div>
  );
}
