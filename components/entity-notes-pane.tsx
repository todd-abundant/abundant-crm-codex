"use client";

import * as React from "react";
import { normalizeRichText, RichTextArea } from "./rich-text-area";

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

type EntityNote = {
  id: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  createdByName?: string | null;
  documents: EntityDocument[];
};

type EntityNotesPaneProps = {
  entityPath: EntityPath;
  entityId: string;
  onStatus?: (status: StatusMessage | null) => void;
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toggleId(current: string[], id: string) {
  if (current.includes(id)) {
    return current.filter((item) => item !== id);
  }
  return [...current, id];
}

function mapDocumentIdsForNote(note: EntityNote) {
  return note.documents.map((document) => document.id);
}

export function EntityNotesPane({ entityPath, entityId, onStatus }: EntityNotesPaneProps) {
  const [notes, setNotes] = React.useState<EntityNote[]>([]);
  const [documents, setDocuments] = React.useState<EntityDocument[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [newNoteText, setNewNoteText] = React.useState("");
  const [newNoteDocumentIds, setNewNoteDocumentIds] = React.useState<string[]>([]);
  const [addingNote, setAddingNote] = React.useState(false);

  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = React.useState("");
  const [editingNoteDocumentIds, setEditingNoteDocumentIds] = React.useState<string[]>([]);
  const [savingNoteId, setSavingNoteId] = React.useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = React.useState<string | null>(null);

  const notesEndpoint = React.useMemo(() => `/api/${entityPath}/${entityId}/notes`, [entityId, entityPath]);
  const documentsEndpoint = React.useMemo(() => `/api/${entityPath}/${entityId}/documents`, [entityId, entityPath]);

  const resetCreateForm = React.useCallback(() => {
    setShowCreateForm(false);
    setNewNoteText("");
    setNewNoteDocumentIds([]);
  }, []);

  const resetEditingForm = React.useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteText("");
    setEditingNoteDocumentIds([]);
  }, []);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [documentsRes, notesRes] = await Promise.all([
        fetch(documentsEndpoint, { cache: "no-store" }),
        fetch(notesEndpoint, { cache: "no-store" })
      ]);
      const [documentsPayload, notesPayload] = await Promise.all([documentsRes.json(), notesRes.json()]);

      if (!documentsRes.ok) {
        throw new Error(documentsPayload.error || "Failed to load documents");
      }
      if (!notesRes.ok) {
        throw new Error(notesPayload.error || "Failed to load notes");
      }

      setDocuments(Array.isArray(documentsPayload.documents) ? documentsPayload.documents : []);
      setNotes(Array.isArray(notesPayload.notes) ? notesPayload.notes : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [documentsEndpoint, notesEndpoint]);

  React.useEffect(() => {
    resetCreateForm();
    resetEditingForm();
    void loadData();
  }, [entityId, loadData, resetCreateForm, resetEditingForm]);

  async function addNote() {
    if (!newNoteText.trim()) {
      onStatus?.({ kind: "error", text: "Note text is required." });
      return;
    }

    setAddingNote(true);
    onStatus?.(null);

    try {
      const res = await fetch(notesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: newNoteText,
          documentIds: newNoteDocumentIds
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to add note");
      }

      resetCreateForm();
      await loadData();
      onStatus?.({ kind: "ok", text: "Note added." });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to add note"
      });
    } finally {
      setAddingNote(false);
    }
  }

  function beginEdit(note: EntityNote) {
    setEditingNoteId(note.id);
    setEditingNoteText(note.note || "");
    setEditingNoteDocumentIds(mapDocumentIdsForNote(note));
  }

  async function saveNote(noteId: string) {
    if (!editingNoteText.trim()) {
      onStatus?.({ kind: "error", text: "Note text is required." });
      return;
    }

    setSavingNoteId(noteId);
    onStatus?.(null);

    try {
      const res = await fetch(notesEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId,
          note: editingNoteText,
          documentIds: editingNoteDocumentIds
        })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to update note");
      }

      resetEditingForm();
      await loadData();
      onStatus?.({ kind: "ok", text: "Note updated." });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to update note"
      });
    } finally {
      setSavingNoteId(null);
    }
  }

  async function deleteNote(noteId: string) {
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;

    setDeletingNoteId(noteId);
    onStatus?.(null);

    try {
      const res = await fetch(notesEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId })
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete note");
      }

      await loadData();
      onStatus?.({ kind: "ok", text: "Note deleted." });
    } catch (requestError) {
      onStatus?.({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to delete note"
      });
    } finally {
      setDeletingNoteId(null);
    }
  }

  return (
    <div className="detail-section">
      <p className="detail-label">Notes</p>

      {loading ? <p className="muted">Loading notes...</p> : null}
      {!loading && error ? <p className="status error">{error}</p> : null}

      {!loading && !error && notes.length === 0 ? <p className="muted">No notes yet.</p> : null}

      {!loading && !error
        ? notes.map((note) => (
            <div key={note.id} className="detail-list-item">
                  {editingNoteId === note.id ? (
                    <div className="detail-card">
                      <label>Note</label>
                      <RichTextArea
                        className="entity-note-textarea"
                        value={editingNoteText}
                        onChange={setEditingNoteText}
                        placeholder="Relationship context, meeting notes, and follow-ups"
                        rows={10}
                      />

                  {documents.length > 0 ? (
                    <div className="entity-document-picker">
                      <p className="muted">Attach documents</p>
                      <div className="entity-document-picker-list">
                        {documents.map((document) => (
                          <label key={document.id} className="entity-document-picker-item">
                            <input
                              type="checkbox"
                              checked={editingNoteDocumentIds.includes(document.id)}
                              onChange={() =>
                                setEditingNoteDocumentIds((current) => toggleId(current, document.id))
                              }
                            />
                            <span>{document.title}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Add documents first to attach them to notes.</p>
                  )}

                  <div className="actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void saveNote(note.id)}
                      disabled={savingNoteId === note.id}
                    >
                      {savingNoteId === note.id ? "Saving..." : "Save Note"}
                    </button>
                    <button type="button" className="ghost small" onClick={resetEditingForm}>
                      Cancel
                    </button>
                  </div>
                </div>
                  ) : (
                    <div className="contact-row">
                      <div className="contact-row-details">
                        <p
                          className="entity-note-body"
                          dangerouslySetInnerHTML={{ __html: normalizeRichText(note.note) }}
                        />
                    <p className="muted">{formatDateTime(note.createdAt)} by {note.createdByName || "Unknown user"}</p>
                    {note.documents.length > 0 ? (
                      <div className="entity-note-attachments">
                        {note.documents.map((document) => (
                          <a key={`${note.id}-${document.id}`} href={document.url} target="_blank" rel="noreferrer">
                            {document.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="contact-row-actions">
                    <button type="button" className="ghost small" onClick={() => beginEdit(note)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => void deleteNote(note.id)}
                      disabled={deletingNoteId === note.id}
                    >
                      {deletingNoteId === note.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        : null}

      {showCreateForm ? (
        <div className="detail-card" style={{ marginTop: 12 }}>
          <label>Note</label>
          <RichTextArea
            className="entity-note-textarea"
            value={newNoteText}
            onChange={setNewNoteText}
            placeholder="Relationship context, meeting notes, and follow-ups"
            rows={10}
          />

          {documents.length > 0 ? (
            <div className="entity-document-picker">
              <p className="muted">Attach documents</p>
              <div className="entity-document-picker-list">
                {documents.map((document) => (
                  <label key={document.id} className="entity-document-picker-item">
                    <input
                      type="checkbox"
                      checked={newNoteDocumentIds.includes(document.id)}
                      onChange={() => setNewNoteDocumentIds((current) => toggleId(current, document.id))}
                    />
                    <span>{document.title}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">Add documents first to attach them to notes.</p>
          )}

          <div className="actions">
            <button type="button" className="secondary" onClick={() => void addNote()} disabled={addingNote}>
              {addingNote ? "Adding..." : "Add Note"}
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
            Add Note
          </button>
        </div>
      )}
    </div>
  );
}
