import { type EntityKind, type User } from "@prisma/client";
import { prisma } from "@/lib/db";

type EntityDocumentInput = {
  title: string;
  url: string;
  notes?: string | null;
  uploadedAt?: string | null;
};

type EntityNoteInput = {
  note: string;
  documentIds?: string[];
  createdByUserId?: string | null;
  createdByName?: string | null;
};

type EntityDocumentWithMeta = {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  title: string;
  url: string;
  notes: string | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type EntityNoteWithAttachments = {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  note: string;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUser: Pick<User, "id" | "name" | "email"> | null;
  attachments: Array<{
    document: EntityDocumentWithMeta;
  }>;
};

const entityNotFoundMessageByKind: Record<EntityKind, string> = {
  HEALTH_SYSTEM: "Health system not found",
  CO_INVESTOR: "Co-investor not found",
  COMPANY: "Company not found"
};

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function parseUploadedAt(value?: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function ensureTrimmedValue(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

async function entityExists(entityKind: EntityKind, entityId: string) {
  if (entityKind === "HEALTH_SYSTEM") {
    const record = await prisma.healthSystem.findUnique({ where: { id: entityId }, select: { id: true } });
    return !!record;
  }

  if (entityKind === "CO_INVESTOR") {
    const record = await prisma.coInvestor.findUnique({ where: { id: entityId }, select: { id: true } });
    return !!record;
  }

  const record = await prisma.company.findUnique({ where: { id: entityId }, select: { id: true } });
  return !!record;
}

async function validateAttachmentDocuments(entityKind: EntityKind, entityId: string, documentIds: string[]) {
  const uniqueIds = Array.from(
    new Set(
      documentIds
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  if (uniqueIds.length === 0) {
    return [] as string[];
  }

  const matchingDocuments = await prisma.entityDocument.findMany({
    where: {
      id: { in: uniqueIds },
      entityKind,
      entityId
    },
    select: { id: true }
  });

  if (matchingDocuments.length !== uniqueIds.length) {
    throw new Error("One or more attached documents are invalid.");
  }

  return uniqueIds;
}

function mapDocument(document: EntityDocumentWithMeta) {
  return {
    id: document.id,
    title: document.title,
    url: document.url,
    notes: document.notes,
    uploadedAt: document.uploadedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function mapNote(note: EntityNoteWithAttachments) {
  return {
    id: note.id,
    note: note.note,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    createdByUserId: note.createdByUserId,
    createdByName: note.createdByName || note.createdByUser?.name || note.createdByUser?.email || "Unknown user",
    documents: note.attachments.map((attachment) => mapDocument(attachment.document))
  };
}

export async function getEntityNotFoundMessage(entityKind: EntityKind, entityId: string) {
  const exists = await entityExists(entityKind, entityId);
  if (exists) return null;
  return entityNotFoundMessageByKind[entityKind];
}

export async function listEntityDocuments(entityKind: EntityKind, entityId: string) {
  const documents = await prisma.entityDocument.findMany({
    where: { entityKind, entityId },
    orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }]
  });

  return documents.map((document) => mapDocument(document));
}

export async function createEntityDocument(entityKind: EntityKind, entityId: string, input: EntityDocumentInput) {
  const created = await prisma.entityDocument.create({
    data: {
      entityKind,
      entityId,
      title: ensureTrimmedValue(input.title, "Document title"),
      url: ensureTrimmedValue(input.url, "Document URL"),
      notes: toNullableString(input.notes),
      uploadedAt: parseUploadedAt(input.uploadedAt)
    }
  });

  return mapDocument(created);
}

export async function updateEntityDocument(
  entityKind: EntityKind,
  entityId: string,
  documentId: string,
  input: EntityDocumentInput
) {
  const existing = await prisma.entityDocument.findFirst({
    where: {
      id: documentId,
      entityKind,
      entityId
    },
    select: { id: true }
  });

  if (!existing) {
    return null;
  }

  const updated = await prisma.entityDocument.update({
    where: { id: documentId },
    data: {
      title: ensureTrimmedValue(input.title, "Document title"),
      url: ensureTrimmedValue(input.url, "Document URL"),
      notes: toNullableString(input.notes),
      uploadedAt: parseUploadedAt(input.uploadedAt)
    }
  });

  return mapDocument(updated);
}

export async function deleteEntityDocument(entityKind: EntityKind, entityId: string, documentId: string) {
  const deleted = await prisma.entityDocument.deleteMany({
    where: {
      id: documentId,
      entityKind,
      entityId
    }
  });

  return deleted.count > 0;
}

export async function listEntityNotes(entityKind: EntityKind, entityId: string) {
  const notes = await prisma.entityNote.findMany({
    where: { entityKind, entityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      attachments: {
        orderBy: { attachedAt: "desc" },
        include: {
          document: true
        }
      }
    }
  });

  return notes.map((note) => mapNote(note as EntityNoteWithAttachments));
}

export async function createEntityNote(entityKind: EntityKind, entityId: string, input: EntityNoteInput) {
  const noteText = ensureTrimmedValue(input.note, "Note");
  const attachmentIds = await validateAttachmentDocuments(entityKind, entityId, input.documentIds || []);

  const created = await prisma.entityNote.create({
    data: {
      entityKind,
      entityId,
      note: noteText,
      createdByUserId: input.createdByUserId || null,
      createdByName: toNullableString(input.createdByName),
      attachments:
        attachmentIds.length > 0
          ? {
              create: attachmentIds.map((documentId) => ({
                documentId
              }))
            }
          : undefined
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      attachments: {
        orderBy: { attachedAt: "desc" },
        include: {
          document: true
        }
      }
    }
  });

  return mapNote(created as EntityNoteWithAttachments);
}

export async function updateEntityNote(
  entityKind: EntityKind,
  entityId: string,
  noteId: string,
  input: EntityNoteInput
) {
  const existing = await prisma.entityNote.findFirst({
    where: {
      id: noteId,
      entityKind,
      entityId
    },
    select: { id: true }
  });

  if (!existing) {
    return null;
  }

  const noteText = ensureTrimmedValue(input.note, "Note");
  const attachmentIds = await validateAttachmentDocuments(entityKind, entityId, input.documentIds || []);

  const updated = await prisma.entityNote.update({
    where: { id: noteId },
    data: {
      note: noteText,
      attachments: {
        deleteMany: {},
        create: attachmentIds.map((documentId) => ({ documentId }))
      }
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      attachments: {
        orderBy: { attachedAt: "desc" },
        include: {
          document: true
        }
      }
    }
  });

  return mapNote(updated as EntityNoteWithAttachments);
}

export async function deleteEntityNote(entityKind: EntityKind, entityId: string, noteId: string) {
  const deleted = await prisma.entityNote.deleteMany({
    where: {
      id: noteId,
      entityKind,
      entityId
    }
  });

  return deleted.count > 0;
}
