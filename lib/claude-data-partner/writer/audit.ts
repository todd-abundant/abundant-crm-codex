import type { Prisma } from '@prisma/client';
import type { PlannedChange } from '../types';

/**
 * Creates ExternalMessageCapture rows for Gmail-sourced EntityNotes.
 * Upserts on the unique key (provider, externalMessageId, entityKind, entityId)
 * to ensure idempotency.
 */
export async function writeExternalMessageCaptures(
  notes: PlannedChange[],
  entityIdMap: Map<string, string>, // changeId → written entityId
  actorId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  for (const note of notes) {
    if (note.source.kind !== 'gmail') continue;
    if (note.table !== 'EntityNote') continue;
    if (!note.operation || note.operation === 'SKIP') continue;

    const entityId = entityIdMap.get(note.id);
    if (!entityId) continue;

    const candidate = note._candidate;
    if (!candidate || candidate.kind !== 'EntityNote') continue;

    const messageId = note.source.messageId;
    const threadId = note.source.threadId;

    // Map entity kind to Prisma EntityKind enum
    const entityKindMap: Record<string, string> = {
      COMPANY: 'COMPANY',
      HEALTH_SYSTEM: 'HEALTH_SYSTEM',
      CO_INVESTOR: 'CO_INVESTOR',
      CONTACT: 'CONTACT',
    };
    const entityKind = entityKindMap[candidate.entityKind];
    if (!entityKind) continue;

    try {
      await tx.externalMessageCapture.upsert({
        where: {
          provider_externalMessageId_entityKind_entityId: {
            provider: 'GMAIL',
            externalMessageId: messageId,
            entityKind: entityKind as never,
            entityId,
          },
        },
        update: {},
        create: {
          provider: 'GMAIL',
          externalMessageId: messageId,
          threadId: threadId || null,
          entityKind: entityKind as never,
          entityId,
          noteId: entityId, // best effort; the actual note id
          capturedByUserId: actorId,
        },
      });
    } catch {
      // Non-fatal: idempotency violation or missing noteId are acceptable
    }
  }
}
