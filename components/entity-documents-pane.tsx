"use client";

import * as React from "react";
import { DateInputField } from "./date-input-field";
import { parseDateInput, toDateInputValue as formatDateInputValue } from "@/lib/date-parse";
import {
  inferGoogleDocumentTitle,
  MAX_COMPANY_DOCUMENT_FILE_BYTES,
  normalizeCompanyDocumentUrl,
  normalizeGoogleDocsUrl,
  readFileAsDataUrl
} from "@/lib/company-document-links";
import { resolveGoogleDocumentTitle } from "@/lib/google-document-title";

type EntityPath = "health-systems" | "co-investors" | "companies" | "contacts";

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

const entityDocumentUploadAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp";
const entityDocumentMaxSizeMb = Math.round(MAX_COMPANY_DOCUMENT_FILE_BYTES / (1024 * 1024));

function formatDate(value: string) {
  return parseDateForDisplay(value);
}

function toDateInputValue(value: string | null | undefined) {
  return formatDateInputValue(value);
}

function parseDateForDisplay(value: string | null | undefined) {
  if (!value) return value ?? "";
  const parsed = parseDateInput(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US");
}

function isEmbeddedDocumentUrl(value: string) {
  return value.startsWith("data:");
}

function documentLinkLabel(document: Pick<EntityDocument, "title" | "url">, resolvedTitle: string | null) {
  const trimmedTitle = document.title.trim();
  if (resolvedTitle) return resolvedTitle;
  if (trimmedTitle) return trimmedTitle;
  return isEmbeddedDocumentUrl(document.url) ? "Open uploaded file" : document.url;
}

export function EntityDocumentsPane({ entityPath, entityId, onStatus }: EntityDocumentsPaneProps) {
  const [documents, setDocuments] = React.useState<EntityDocument[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showAddDocumentModal, setShowAddDocumentModal] = React.useState(false);
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
  const [resolvedGoogleDocumentTitles, setResolvedGoogleDocumentTitles] = React.useState<Record<string, string>>({});

  const endpoint = React.useMemo(() => `/api/${entityPath}/${entityId}/documents`, [entityId, entityPath]);

  const resetCreateForm = React.useCallback(() => {
    setShowAddDocumentModal(false);
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
    setResolvedGoogleDocumentTitles({});

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
    const googleDocuments = documents.filter((document) => {
      const normalizedUrl = normalizeGoogleDocsUrl(document.url);
      if (!normalizedUrl) return false;

      const resolvedTitle = inferGoogleDocumentTitle(normalizedUrl);
      return resolvedTitle === document.title.trim() && Boolean(document.title.trim());
    });

    if (googleDocuments.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      googleDocuments.map(async (document) => {
        const resolvedTitle = await resolveGoogleDocumentTitle(document.url);
        if (!resolvedTitle) return null;
        return [document.id, resolvedTitle] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        const updates = entries.filter((entry): entry is readonly [string, string] => entry !== null);
        if (updates.length === 0) return;

        setResolvedGoogleDocumentTitles((previous) => {
          const next = { ...previous };
          let hasChanges = false;

          for (const [documentId, title] of updates) {
            if (next[documentId] !== title) {
              next[documentId] = title;
              hasChanges = true;
            }
          }

          return hasChanges ? next : previous;
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("entity_documents_google_titles_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
    };
  }, [documents]);

  React.useEffect(() => {
    resetCreateForm();
    resetEditingForm();
    void loadDocuments();
  }, [entityId, endpoint, loadDocuments, resetCreateForm, resetEditingForm]);

  async function createDocument(input: { title: string; url: string; notes: string; uploadedAt: string }) {
    setAddingDocument(true);
    onStatus?.(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          url: input.url,
          notes: input.notes,
          uploadedAt: input.uploadedAt || null
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add document");
      }

      resetCreateForm();
      await loadDocuments();
      onStatus?.({ kind: "ok", text: `${payload.document?.title || "Document"} added.` });
      return true;
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to add document"
      });
      return false;
    } finally {
      setAddingDocument(false);
    }
  }

  async function addDocumentFromLink() {
    const normalizedUrl = normalizeCompanyDocumentUrl(newUrl);
    if (!normalizedUrl) {
      onStatus?.({ kind: "error", text: "Provide a valid document link." });
      return;
    }

    let title = newTitle.trim();
    const normalizedGoogleUrl = normalizeGoogleDocsUrl(normalizedUrl);
    if (!title && normalizedGoogleUrl) {
      const resolvedTitle = await resolveGoogleDocumentTitle(normalizedGoogleUrl);
      title = resolvedTitle || inferGoogleDocumentTitle(normalizedGoogleUrl);
    }

    if (!title) {
      onStatus?.({ kind: "error", text: "Document title is required for non-Google links." });
      return;
    }

    await createDocument({
      title,
      url: normalizedUrl,
      notes: newNotes,
      uploadedAt: newUploadedAt
    });
  }

  async function addDocumentFromUpload(file: File) {
    if (file.size > MAX_COMPANY_DOCUMENT_FILE_BYTES) {
      onStatus?.({
        kind: "error",
        text: `File is too large. Max size is ${entityDocumentMaxSizeMb} MB.`
      });
      return;
    }

    const title = newTitle.trim() || file.name.trim() || "Uploaded Document";

    try {
      const dataUrl = await readFileAsDataUrl(file);
      await createDocument({
        title,
        url: dataUrl,
        notes: newNotes,
        uploadedAt: newUploadedAt
      });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to process uploaded document."
      });
    }
  }

  function beginEdit(document: EntityDocument) {
    setEditingDocumentId(document.id);
    setEditingTitle(document.title || "");
    setEditingUrl(document.url || "");
    setEditingNotes(document.notes || "");
    setEditingUploadedAt(toDateInputValue(document.uploadedAt));
    onStatus?.(null);
  }

  async function saveDocument(documentId: string) {
    const normalizedUrl = normalizeCompanyDocumentUrl(editingUrl);
    if (!normalizedUrl) {
      onStatus?.({ kind: "error", text: "Document URL is required." });
      return;
    }

    const title = editingTitle.trim();
    if (!title) {
      onStatus?.({ kind: "error", text: "Document title is required." });
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
          title,
          url: normalizedUrl,
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

      <div className="detail-action-bar">
        <a
          href="#"
          className="pipeline-action-link"
          onClick={(event) => {
            event.preventDefault();
            onStatus?.(null);
            setShowAddDocumentModal(true);
          }}
        >
          Add Document
        </a>
      </div>

      {loading ? <p className="muted">Loading documents...</p> : null}
      {!loading && error ? <p className="status error">{error}</p> : null}

      {!loading && !error && documents.length === 0 ? <p className="muted">No documents yet.</p> : null}

      {!loading && !error
        ? (
          <div className="pipeline-doc-list">
            {documents.map((document) => (
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
                        <label>Uploaded Date</label>
                        <DateInputField value={editingUploadedAt} onChange={setEditingUploadedAt} />
                      </div>
                      <div className={isEmbeddedDocumentUrl(editingUrl) ? "" : "detail-grid-full"}>
                        <label>URL</label>
                        {isEmbeddedDocumentUrl(editingUrl) ? (
                          <>
                            <input value="Uploaded file (stored in record)" readOnly />
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => setEditingUrl("")}
                              style={{ marginTop: 8 }}
                            >
                              Replace with Link
                            </button>
                          </>
                        ) : (
                          <input
                            value={editingUrl}
                            onChange={(event) => setEditingUrl(event.target.value)}
                            placeholder="https://example.com/document"
                          />
                        )}
                      </div>
                      <div className="detail-grid-full">
                        <label>Notes</label>
                        <textarea
                          rows={3}
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
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          download={isEmbeddedDocumentUrl(document.url) ? document.title : undefined}
                        >
                          {documentLinkLabel(document, resolvedGoogleDocumentTitles[document.id] || null)}
                        </a>
                      </strong>
                      <p className="muted">Uploaded {formatDate(document.uploadedAt)}</p>
                      {document.notes ? <p className="muted">{document.notes}</p> : null}
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
            ))}
          </div>
        )
        : null}

      {showAddDocumentModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => !addingDocument && resetCreateForm()}>
          <div className="pipeline-note-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="pipeline-card-head">
              <h3>Add Document</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={resetCreateForm}
                aria-label="Close add document dialog"
                disabled={addingDocument}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p className="muted">Add a Google Docs or Drive link, another document URL, or upload a file.</p>
            <div className="detail-grid">
              <div>
                <label>Document Title (optional)</label>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Optional for Google Docs or uploads"
                />
              </div>
              <div>
                <label>Document Link</label>
                <input
                  value={newUrl}
                  onChange={(event) => setNewUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label>Uploaded Date</label>
                <DateInputField value={newUploadedAt} onChange={setNewUploadedAt} />
              </div>
              <div>
                <label>Upload from Computer</label>
                <input
                  type="file"
                  accept={entityDocumentUploadAccept}
                  disabled={addingDocument}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void addDocumentFromUpload(file);
                  }}
                />
              </div>
              <div className="detail-grid-full">
                <label>Notes</label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(event) => setNewNotes(event.target.value)}
                  placeholder="Optional context"
                />
              </div>
            </div>
            <div className="actions">
              <button className="ghost small" type="button" onClick={resetCreateForm} disabled={addingDocument}>
                Cancel
              </button>
              <button className="secondary small" type="button" onClick={() => void addDocumentFromLink()} disabled={addingDocument}>
                {addingDocument ? "Adding..." : "Add Document"}
              </button>
            </div>
            <p className="muted">{`Uploads are limited to ${entityDocumentMaxSizeMb} MB per file.`}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
