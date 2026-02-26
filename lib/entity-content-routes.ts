import { type EntityKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createEntityDocument,
  createEntityNote,
  deleteEntityDocument,
  deleteEntityNote,
  getEntityNotFoundMessage,
  listEntityDocuments,
  listEntityNotes,
  updateEntityDocument,
  updateEntityNote
} from "@/lib/entity-record-content";

const documentCreateSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  notes: z.string().optional().nullable(),
  uploadedAt: z.string().optional().nullable()
});

const documentUpdateSchema = documentCreateSchema.extend({
  documentId: z.string().min(1)
});

const documentDeleteSchema = z.object({
  documentId: z.string().min(1)
});

const noteCreateSchema = z.object({
  note: z.string().min(1),
  documentIds: z.array(z.string().min(1)).optional()
});

const noteUpdateSchema = noteCreateSchema.extend({
  noteId: z.string().min(1)
});

const noteDeleteSchema = z.object({
  noteId: z.string().min(1)
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveEntityOr404(entityKind: EntityKind, entityId: string) {
  const notFoundMessage = await getEntityNotFoundMessage(entityKind, entityId);
  if (!notFoundMessage) return null;
  return NextResponse.json({ error: notFoundMessage }, { status: 404 });
}

export function createEntityDocumentsHandlers(entityKind: EntityKind, entityLabel: string) {
  return {
    async GET(_request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const documents = await listEntityDocuments(entityKind, id);
        return NextResponse.json({ documents });
      } catch (error) {
        console.error("list_entity_documents_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to load ${entityLabel} documents` }, { status: 400 });
      }
    },

    async POST(request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const body = await request.json();
        const input = documentCreateSchema.parse(body);
        const document = await createEntityDocument(entityKind, id, input);
        return NextResponse.json({ document }, { status: 201 });
      } catch (error) {
        console.error("create_entity_document_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to add ${entityLabel} document` }, { status: 400 });
      }
    },

    async PATCH(request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const body = await request.json();
        const input = documentUpdateSchema.parse(body);
        const document = await updateEntityDocument(entityKind, id, input.documentId, input);

        if (!document) {
          return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        return NextResponse.json({ document });
      } catch (error) {
        console.error("update_entity_document_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to update ${entityLabel} document` }, { status: 400 });
      }
    },

    async DELETE(request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const body = await request.json();
        const input = documentDeleteSchema.parse(body);
        const deleted = await deleteEntityDocument(entityKind, id, input.documentId);

        if (!deleted) {
          return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        return NextResponse.json({ deleted: true, id: input.documentId });
      } catch (error) {
        console.error("delete_entity_document_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to delete ${entityLabel} document` }, { status: 400 });
      }
    }
  };
}

export function createEntityNotesHandlers(entityKind: EntityKind, entityLabel: string) {
  return {
    async GET(_request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const notes = await listEntityNotes(entityKind, id);
        return NextResponse.json({ notes });
      } catch (error) {
        console.error("list_entity_notes_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to load ${entityLabel} notes` }, { status: 400 });
      }
    },

    async POST(request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const body = await request.json();
        const input = noteCreateSchema.parse(body);
        const note = await createEntityNote(entityKind, id, input);
        return NextResponse.json({ note }, { status: 201 });
      } catch (error) {
        console.error("create_entity_note_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to add ${entityLabel} note` }, { status: 400 });
      }
    },

    async PATCH(request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const body = await request.json();
        const input = noteUpdateSchema.parse(body);
        const note = await updateEntityNote(entityKind, id, input.noteId, input);

        if (!note) {
          return NextResponse.json({ error: "Note not found" }, { status: 404 });
        }

        return NextResponse.json({ note });
      } catch (error) {
        console.error("update_entity_note_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to update ${entityLabel} note` }, { status: 400 });
      }
    },

    async DELETE(request: Request, context: RouteContext) {
      try {
        const { id } = await context.params;
        const notFoundResponse = await resolveEntityOr404(entityKind, id);
        if (notFoundResponse) return notFoundResponse;

        const body = await request.json();
        const input = noteDeleteSchema.parse(body);
        const deleted = await deleteEntityNote(entityKind, id, input.noteId);

        if (!deleted) {
          return NextResponse.json({ error: "Note not found" }, { status: 404 });
        }

        return NextResponse.json({ deleted: true, id: input.noteId });
      } catch (error) {
        console.error("delete_entity_note_error", { entityKind, error });
        return NextResponse.json({ error: `Failed to delete ${entityLabel} note` }, { status: 400 });
      }
    }
  };
}
