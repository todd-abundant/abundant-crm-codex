import { prisma } from "@/lib/db";
import {
  buildSignalDedupeKey,
  discoverSignalsViaWebSearch,
  normalizeDomain
} from "@/lib/signal-discovery";

type MinimalContact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  principalEntityType: string | null;
  principalEntityId: string | null;
  healthSystemLinks: Array<{
    healthSystem: {
      name: string;
    };
  }>;
  companyLinks: Array<{
    company: {
      name: string;
    };
  }>;
  coInvestorLinks: Array<{
    coInvestor: {
      name: string;
    };
  }>;
};

async function discoverSignalsForContact(input: {
  contact: MinimalContact;
  maxSignalsPerEntity: number;
  lookbackDays: number;
}) {
  const { contact, maxSignalsPerEntity, lookbackDays } = input;
  const companies = contact.companyLinks.map((entry) => entry.company.name).slice(0, 5);
  const healthSystems = contact.healthSystemLinks.map((entry) => entry.healthSystem.name).slice(0, 5);
  const coInvestors = contact.coInvestorLinks.map((entry) => entry.coInvestor.name).slice(0, 5);

  return discoverSignalsViaWebSearch({
    cacheKey: ["contact-signals", contact.id, maxSignalsPerEntity, lookbackDays].join(":"),
    schemaName: "contact_signals",
    maxSignals: maxSignalsPerEntity,
    prompt:
      `Find up to ${maxSignalsPerEntity} high-value signals from the last ${lookbackDays} days for this contact.\n` +
      `Name: ${contact.name}\n` +
      `Title: ${contact.title || "unknown"}\n` +
      `LinkedIn: ${contact.linkedinUrl || "unknown"}\n` +
      `Principal entity type: ${contact.principalEntityType || "unknown"}\n` +
      `Associated companies: ${companies.join(", ") || "unknown"}\n` +
      `Associated health systems: ${healthSystems.join(", ") || "unknown"}\n` +
      `Associated co-investors: ${coInvestors.join(", ") || "unknown"}\n` +
      "Prefer events such as ROLE_CHANGE, PROMOTION, SPEAKING_EVENT, BOARD_APPOINTMENT, AWARD, MAJOR_QUOTE, PUBLICATION, and ORGANIZATION_MILESTONE.\n" +
      "Only return signals when the identity match is strong enough to be relationship-safe."
  });
}

export async function runContactSignalsSweep(input?: {
  maxContacts?: number;
  maxSignalsPerEntity?: number;
  lookbackDays?: number;
}) {
  const startedAtMs = Date.now();
  const maxContacts = Math.min(Math.max(input?.maxContacts ?? 10, 1), 100);
  const maxSignalsPerEntity = Math.min(Math.max(input?.maxSignalsPerEntity ?? 4, 1), 10);
  const lookbackDays = Math.min(Math.max(input?.lookbackDays ?? 14, 1), 30);

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY is not configured",
      maxContacts,
      maxSignalsPerEntity,
      lookbackDays,
      processed: 0,
      discovered: 0,
      persisted: 0,
      failed: 0,
      durationMs: Date.now() - startedAtMs
    };
  }

  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      linkedinUrl: true,
      principalEntityType: true,
      principalEntityId: true,
      healthSystemLinks: {
        select: {
          healthSystem: {
            select: { name: true }
          }
        },
        take: 5
      },
      companyLinks: {
        select: {
          company: {
            select: { name: true }
          }
        },
        take: 5
      },
      coInvestorLinks: {
        select: {
          coInvestor: {
            select: { name: true }
          }
        },
        take: 5
      }
    },
    orderBy: { updatedAt: "desc" },
    take: maxContacts
  });

  const perContact: Array<{
    contactId: string;
    name: string;
    discovered: number;
    persisted: number;
    error: string | null;
  }> = [];

  let discovered = 0;
  let persisted = 0;
  let failed = 0;

  for (const contact of contacts) {
    try {
      const signals = await discoverSignalsForContact({
        contact,
        maxSignalsPerEntity,
        lookbackDays
      });
      discovered += signals.length;

      const createManyResult = signals.length
        ? await prisma.contactSignalEvent.createMany({
            data: signals.map((signal) => ({
              contactId: contact.id,
              eventType: signal.eventType,
              headline: signal.headline,
              summary: signal.summary,
              suggestedOutreach: signal.suggestedOutreach || null,
              confidenceScore: signal.confidenceScore,
              relevanceScore: signal.relevanceScore,
              signalDate: signal.signalDate ? new Date(signal.signalDate) : null,
              sourceUrl: signal.sourceUrl,
              sourceDomain: normalizeDomain(signal.sourceUrl) || null,
              sourceTitle: signal.sourceTitle || null,
              sourcePublishedAt: signal.sourcePublishedAt ? new Date(signal.sourcePublishedAt) : null,
              dedupeKey: buildSignalDedupeKey(contact.id, signal),
              metadataJson: signal.competitors.length > 0 ? { competitors: signal.competitors } : undefined
            })),
            skipDuplicates: true
          })
        : { count: 0 };

      persisted += createManyResult.count;
      perContact.push({
        contactId: contact.id,
        name: contact.name,
        discovered: signals.length,
        persisted: createManyResult.count,
        error: null
      });
    } catch (error) {
      failed += 1;
      perContact.push({
        contactId: contact.id,
        name: contact.name,
        discovered: 0,
        persisted: 0,
        error: error instanceof Error ? error.message : "Unknown signal processing error"
      });
      console.error("contact_signal_sweep_error", {
        contactId: contact.id,
        error
      });
    }
  }

  return {
    ok: true,
    maxContacts,
    maxSignalsPerEntity,
    lookbackDays,
    processed: contacts.length,
    discovered,
    persisted,
    failed,
    durationMs: Date.now() - startedAtMs,
    perContact
  };
}
