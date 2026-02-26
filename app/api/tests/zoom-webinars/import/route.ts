import { NextResponse } from "next/server";
import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  resolveOrCreateContact,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";
import {
  fetchZoomWebinarDetails,
  fetchZoomWebinarParticipants,
  fetchZoomWebinarRegistrants,
  type ZoomWebinarParticipant,
  type ZoomWebinarRegistrant
} from "@/lib/zoom-webinars";

const domainOverrideSchema = z.object({
  domain: z.string().min(1),
  healthSystemId: z.string().min(1)
});

const requestSchema = z.object({
  companyId: z.string().min(1),
  webinarId: z.string().min(1),
  webinarTitleOverride: z.string().optional(),
  fallbackHealthSystemId: z.string().optional().or(z.literal("")),
  dryRun: z.boolean().default(true),
  domainOverrides: z.array(domainOverrideSchema).default([])
});

type AllianceHealthSystem = {
  id: string;
  name: string;
  website: string | null;
};

type ContactWithLinks = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  healthSystemLinks: Array<{
    healthSystem: {
      id: string;
      name: string;
      isAllianceMember: boolean;
    };
  }>;
};

type NormalizedAttendee = {
  key: string;
  participantId: string | null;
  registrantId: string | null;
  name: string;
  email: string | null;
  title: string | null;
  organization: string | null;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number | null;
};

type MatchOutcome =
  | {
      matched: true;
      healthSystemId: string;
      healthSystemName: string;
      strategy:
        | "existing_contact_link"
        | "domain_override"
        | "registration_org_exact"
        | "registration_org_partial"
        | "email_domain"
        | "fallback_health_system";
      confidence: number;
    }
  | {
      matched: false;
      reason: string;
    };

const MAX_ROWS_TO_RETURN = 400;

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value?: string | null) {
  const normalized = trimOrNull(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeText(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeDomain(value?: string | null) {
  const raw = trimOrNull(value)?.toLowerCase();
  if (!raw) return null;
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = withoutProtocol.split("/")[0]?.trim();
  return host || null;
}

function domainFromWebsite(website?: string | null) {
  const normalized = trimOrNull(website);
  if (!normalized) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return normalizeDomain(normalized);
  }
}

function domainFromEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
}

function parseDateOrNull(value?: string | null) {
  const normalized = trimOrNull(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedNameFromRegistrant(registrant: ZoomWebinarRegistrant | null) {
  if (!registrant) return null;
  return (
    trimOrNull(registrant.name) ||
    [trimOrNull(registrant.firstName), trimOrNull(registrant.lastName)].filter(Boolean).join(" ").trim() ||
    null
  );
}

function attendeeKeyFrom(participant: ZoomWebinarParticipant, registrant: ZoomWebinarRegistrant | null) {
  const email = normalizeEmail(participant.email) || normalizeEmail(registrant?.email || null);
  if (email) return `email:${email}`;
  if (participant.registrantId) return `registrant:${participant.registrantId}`;
  return `name:${normalizeText(participant.name) || participant.name.toLowerCase()}`;
}

function mergeAttendee(base: NormalizedAttendee, incoming: NormalizedAttendee): NormalizedAttendee {
  const existingDuration = base.durationMinutes ?? 0;
  const incomingDuration = incoming.durationMinutes ?? 0;

  let joinTime = base.joinTime;
  if (incoming.joinTime && (!joinTime || new Date(incoming.joinTime) < new Date(joinTime))) {
    joinTime = incoming.joinTime;
  }

  let leaveTime = base.leaveTime;
  if (incoming.leaveTime && (!leaveTime || new Date(incoming.leaveTime) > new Date(leaveTime))) {
    leaveTime = incoming.leaveTime;
  }

  return {
    ...base,
    participantId: base.participantId || incoming.participantId,
    registrantId: base.registrantId || incoming.registrantId,
    name: base.name || incoming.name,
    email: base.email || incoming.email,
    title: base.title || incoming.title,
    organization: base.organization || incoming.organization,
    joinTime,
    leaveTime,
    durationMinutes:
      base.durationMinutes === null && incoming.durationMinutes === null
        ? null
        : existingDuration + incomingDuration
  };
}

function formatImportNote(attendee: NormalizedAttendee, webinarId: string) {
  const parts = [`source=zoom-webinar:${webinarId}`];
  if (attendee.joinTime) parts.push(`join=${attendee.joinTime}`);
  if (attendee.leaveTime) parts.push(`leave=${attendee.leaveTime}`);
  if (attendee.durationMinutes !== null) parts.push(`durationMin=${attendee.durationMinutes}`);
  return parts.join(" | ");
}

function appendUniqueLine(existing: string | null, line: string) {
  if (!line) return existing;
  if (!existing || !existing.trim()) return line;
  if (existing.includes(line)) return existing;
  return `${existing.trim()}\n${line}`;
}

function dedupeHealthSystems(input: Array<{ id: string; name: string }>) {
  const seen = new Set<string>();
  const deduped: Array<{ id: string; name: string }> = [];
  for (const item of input) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

function findHealthSystemByOrganization(
  organization: string | null,
  healthSystems: AllianceHealthSystem[]
): { match: AllianceHealthSystem | null; partial: boolean; ambiguous: boolean } {
  const normalizedOrg = normalizeText(organization);
  if (!normalizedOrg || normalizedOrg.length < 4) {
    return { match: null, partial: false, ambiguous: false };
  }

  const exact = healthSystems.filter((entry) => normalizeText(entry.name) === normalizedOrg);
  if (exact.length === 1) {
    return { match: exact[0], partial: false, ambiguous: false };
  }
  if (exact.length > 1) {
    return { match: null, partial: false, ambiguous: true };
  }

  const partial = healthSystems.filter((entry) => {
    const normalizedName = normalizeText(entry.name);
    return normalizedName.includes(normalizedOrg) || normalizedOrg.includes(normalizedName);
  });

  if (partial.length === 1) {
    return { match: partial[0], partial: true, ambiguous: false };
  }
  if (partial.length > 1) {
    return { match: null, partial: true, ambiguous: true };
  }

  return { match: null, partial: false, ambiguous: false };
}

async function ensureZoomScreeningEvent(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    webinarId: string;
    webinarTitle: string;
    webinarStartTime?: string | null;
  }
) {
  const zoomMarker = `[zoomWebinarId:${params.webinarId}]`;
  const existing = await tx.companyScreeningEvent.findFirst({
    where: {
      companyId: params.companyId,
      type: "WEBINAR",
      OR: [
        { title: params.webinarTitle },
        { notes: { contains: zoomMarker } }
      ]
    },
    orderBy: [{ createdAt: "asc" }]
  });

  if (existing) {
    return existing;
  }

  return tx.companyScreeningEvent.create({
    data: {
      companyId: params.companyId,
      type: "WEBINAR",
      title: params.webinarTitle,
      scheduledAt: parseDateOrNull(params.webinarStartTime),
      notes: `${zoomMarker} Imported from Zoom webinar attendee report.`
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);
    const fallbackHealthSystemId = trimOrNull(input.fallbackHealthSystemId);
    const webinarId = input.webinarId.trim();

    const [company, allianceHealthSystems] = await Promise.all([
      prisma.company.findUnique({
        where: { id: input.companyId },
        select: { id: true, name: true }
      }),
      prisma.healthSystem.findMany({
        where: { isAllianceMember: true },
        select: {
          id: true,
          name: true,
          website: true
        },
        orderBy: [{ name: "asc" }]
      })
    ]);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const healthSystemById = new Map(allianceHealthSystems.map((entry) => [entry.id, entry]));

    if (fallbackHealthSystemId && !healthSystemById.has(fallbackHealthSystemId)) {
      return NextResponse.json(
        { error: "Fallback health system must be an alliance member." },
        { status: 400 }
      );
    }

    const domainOverrideMap = new Map<string, AllianceHealthSystem>();
    for (const override of input.domainOverrides) {
      const normalizedDomain = normalizeDomain(override.domain);
      if (!normalizedDomain) continue;
      const mappedHealthSystem = healthSystemById.get(override.healthSystemId);
      if (!mappedHealthSystem) {
        return NextResponse.json(
          {
            error: `Domain override references unknown alliance health system: ${override.healthSystemId}`
          },
          { status: 400 }
        );
      }
      domainOverrideMap.set(normalizedDomain, mappedHealthSystem);
    }

    const healthSystemsByWebsiteDomain = new Map<string, AllianceHealthSystem[]>();
    for (const healthSystem of allianceHealthSystems) {
      const domain = domainFromWebsite(healthSystem.website);
      if (!domain) continue;
      const existing = healthSystemsByWebsiteDomain.get(domain) || [];
      existing.push(healthSystem);
      healthSystemsByWebsiteDomain.set(domain, existing);
    }

    const webinarDetails = await fetchZoomWebinarDetails(webinarId);
    const participants = await fetchZoomWebinarParticipants(webinarId);

    let registrants: ZoomWebinarRegistrant[] = [];
    let registrantFetchWarning: string | null = null;
    try {
      registrants = await fetchZoomWebinarRegistrants(webinarId);
    } catch (error) {
      registrantFetchWarning = error instanceof Error ? error.message : "Unable to fetch Zoom registrants.";
    }

    if (participants.length === 0) {
      return NextResponse.json(
        {
          error:
            "No webinar attendees were returned by Zoom. Verify this is a past webinar ID and that report access is enabled."
        },
        { status: 400 }
      );
    }

    const registrantById = new Map<string, ZoomWebinarRegistrant>();
    const registrantByEmail = new Map<string, ZoomWebinarRegistrant>();
    for (const registrant of registrants) {
      const registrantId = trimOrNull(registrant.registrantId);
      const email = normalizeEmail(registrant.email);
      if (registrantId) registrantById.set(registrantId, registrant);
      if (email && !registrantByEmail.has(email)) registrantByEmail.set(email, registrant);
    }

    const attendeeByKey = new Map<string, NormalizedAttendee>();
    for (const participant of participants) {
      const registrant =
        (participant.registrantId ? registrantById.get(participant.registrantId) : null) ||
        (participant.email ? registrantByEmail.get(participant.email.toLowerCase()) : null) ||
        null;

      const name = trimOrNull(participant.name) || normalizedNameFromRegistrant(registrant) || "";
      const email = normalizeEmail(participant.email) || normalizeEmail(registrant?.email || null);
      const attendee: NormalizedAttendee = {
        key: attendeeKeyFrom(participant, registrant),
        participantId: trimOrNull(participant.id),
        registrantId: trimOrNull(participant.registrantId) || trimOrNull(registrant?.registrantId || null),
        name,
        email,
        title: trimOrNull(registrant?.title || null),
        organization: trimOrNull(registrant?.organization || null),
        joinTime: trimOrNull(participant.joinTime),
        leaveTime: trimOrNull(participant.leaveTime),
        durationMinutes:
          typeof participant.durationMinutes === "number" && Number.isFinite(participant.durationMinutes)
            ? participant.durationMinutes
            : null
      };

      if (!attendee.name) continue;

      const existing = attendeeByKey.get(attendee.key);
      attendeeByKey.set(attendee.key, existing ? mergeAttendee(existing, attendee) : attendee);
    }

    const attendees = Array.from(attendeeByKey.values());
    const attendeeEmails = attendees
      .map((attendee) => normalizeEmail(attendee.email))
      .filter((email): email is string => Boolean(email));

    const existingContactsByEmail = new Map<string, ContactWithLinks>();
    if (attendeeEmails.length > 0) {
      const uniqueEmails = Array.from(new Set(attendeeEmails));
      const existingContacts = await prisma.contact.findMany({
        where: {
          OR: uniqueEmails.map((email) => ({
            email: {
              equals: email,
              mode: "insensitive"
            }
          }))
        },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          healthSystemLinks: {
            where: {
              healthSystem: { isAllianceMember: true }
            },
            select: {
              healthSystem: {
                select: {
                  id: true,
                  name: true,
                  isAllianceMember: true
                }
              }
            }
          }
        }
      });

      for (const contact of existingContacts) {
        const email = normalizeEmail(contact.email);
        if (!email || existingContactsByEmail.has(email)) continue;
        existingContactsByEmail.set(email, contact);
      }
    }

    const matchedRows: Array<{
      attendee: NormalizedAttendee;
      healthSystemId: string;
      healthSystemName: string;
      healthSystemStrategy: string;
      healthSystemConfidence: number;
      existingContactId: string | null;
      existingContactName: string | null;
    }> = [];
    const unresolvedRows: Array<{
      name: string;
      email: string | null;
      organization: string | null;
      reason: string;
    }> = [];

    for (const attendee of attendees) {
      const existingContact = attendee.email ? existingContactsByEmail.get(attendee.email) || null : null;
      const existingLinkedSystems = dedupeHealthSystems(
        (existingContact?.healthSystemLinks || []).map((link) => ({
          id: link.healthSystem.id,
          name: link.healthSystem.name
        }))
      );

      const outcome = (() => {
        if (existingLinkedSystems.length === 1) {
          const only = existingLinkedSystems[0];
          return {
            matched: true,
            healthSystemId: only.id,
            healthSystemName: only.name,
            strategy: "existing_contact_link",
            confidence: 0.99
          } as MatchOutcome;
        }

        const organizationMatch = findHealthSystemByOrganization(attendee.organization, allianceHealthSystems);
        if (organizationMatch.ambiguous) {
          return {
            matched: false,
            reason: "Multiple alliance health systems matched the registration organization."
          } as MatchOutcome;
        }
        if (organizationMatch.match) {
          return {
            matched: true,
            healthSystemId: organizationMatch.match.id,
            healthSystemName: organizationMatch.match.name,
            strategy: organizationMatch.partial ? "registration_org_partial" : "registration_org_exact",
            confidence: organizationMatch.partial ? 0.86 : 0.93
          } as MatchOutcome;
        }

        const attendeeDomain = domainFromEmail(attendee.email);
        if (attendeeDomain) {
          const domainOverride = domainOverrideMap.get(attendeeDomain);
          if (domainOverride) {
            return {
              matched: true,
              healthSystemId: domainOverride.id,
              healthSystemName: domainOverride.name,
              strategy: "domain_override",
              confidence: 0.96
            } as MatchOutcome;
          }

          const domainMatches = healthSystemsByWebsiteDomain.get(attendeeDomain) || [];
          if (domainMatches.length === 1) {
            return {
              matched: true,
              healthSystemId: domainMatches[0].id,
              healthSystemName: domainMatches[0].name,
              strategy: "email_domain",
              confidence: 0.8
            } as MatchOutcome;
          }
          if (domainMatches.length > 1) {
            return {
              matched: false,
              reason: "Email domain matched multiple alliance health systems."
            } as MatchOutcome;
          }
        }

        if (fallbackHealthSystemId) {
          const fallback = healthSystemById.get(fallbackHealthSystemId);
          if (fallback) {
            return {
              matched: true,
              healthSystemId: fallback.id,
              healthSystemName: fallback.name,
              strategy: "fallback_health_system",
              confidence: 0.7
            } as MatchOutcome;
          }
        }

        if (existingLinkedSystems.length > 1) {
          return {
            matched: false,
            reason: "Contact email maps to multiple alliance health systems in CRM."
          } as MatchOutcome;
        }

        if (!attendee.email) {
          return {
            matched: false,
            reason: "Missing attendee email; unable to map to an alliance health system."
          } as MatchOutcome;
        }

        return {
          matched: false,
          reason: "Unable to infer alliance health system from contact/link/domain data."
        } as MatchOutcome;
      })();

      if (!outcome.matched) {
        unresolvedRows.push({
          name: attendee.name,
          email: attendee.email,
          organization: attendee.organization,
          reason: outcome.reason
        });
        continue;
      }

      matchedRows.push({
        attendee,
        healthSystemId: outcome.healthSystemId,
        healthSystemName: outcome.healthSystemName,
        healthSystemStrategy: outcome.strategy,
        healthSystemConfidence: outcome.confidence,
        existingContactId: existingContact?.id || null,
        existingContactName: existingContact?.name || null
      });
    }

    const webinarTitle =
      trimOrNull(input.webinarTitleOverride) ||
      trimOrNull(webinarDetails?.topic) ||
      `Zoom Webinar ${webinarId}`;

    const importedRows: Array<{
      attendeeName: string;
      attendeeEmail: string | null;
      healthSystemName: string;
      participantId: string;
      contactId: string;
      contactName: string;
      contactResolution: {
        matchedBy: "created" | "email" | "linkedin" | "name";
        confidence: number;
        wasCreated: boolean;
      };
    }> = [];
    const importErrors: Array<{
      attendeeName: string;
      attendeeEmail: string | null;
      reason: string;
    }> = [];

    let screeningEvent: {
      id: string;
      title: string;
      type: string;
      scheduledAt: Date | null;
      completedAt: Date | null;
    } | null = null;

    if (!input.dryRun && matchedRows.length > 0) {
      screeningEvent = await prisma.$transaction((tx) =>
        ensureZoomScreeningEvent(tx, {
          companyId: company.id,
          webinarId,
          webinarTitle,
          webinarStartTime: webinarDetails?.startTime || null
        })
      );
      const screeningEventId = screeningEvent.id;

      for (const row of matchedRows) {
        try {
          const importNote = formatImportNote(row.attendee, webinarId);
          const outcome = await prisma.$transaction(async (tx) => {
            const contactInputName =
              trimOrNull(row.attendee.name) || trimOrNull(row.existingContactName) || "Unknown attendee";
            const resolved = await resolveOrCreateContact(tx, {
              name: contactInputName,
              title: trimOrNull(row.attendee.title),
              email: trimOrNull(row.attendee.email)
            });

            await upsertHealthSystemContactLink(tx, {
              contactId: resolved.contact.id,
              healthSystemId: row.healthSystemId,
              roleType: "EXECUTIVE",
              title: trimOrNull(row.attendee.title) || resolved.contact.title
            });

            const existingParticipant = await tx.companyScreeningParticipant.findFirst({
              where: {
                screeningEventId,
                healthSystemId: row.healthSystemId,
                contactId: resolved.contact.id
              }
            });

            const participant = existingParticipant
              ? await tx.companyScreeningParticipant.update({
                  where: { id: existingParticipant.id },
                  data: {
                    attendanceStatus: "ATTENDED",
                    notes: appendUniqueLine(existingParticipant.notes, importNote)
                  }
                })
              : await tx.companyScreeningParticipant.create({
                  data: {
                    screeningEventId,
                    healthSystemId: row.healthSystemId,
                    contactId: resolved.contact.id,
                    attendanceStatus: "ATTENDED",
                    notes: importNote
                  }
                });

            return { participant, resolved };
          });

          importedRows.push({
            attendeeName: row.attendee.name,
            attendeeEmail: row.attendee.email,
            healthSystemName: row.healthSystemName,
            participantId: outcome.participant.id,
            contactId: outcome.resolved.contact.id,
            contactName: outcome.resolved.contact.name,
            contactResolution: outcome.resolved.resolution
          });
        } catch (error) {
          importErrors.push({
            attendeeName: row.attendee.name,
            attendeeEmail: row.attendee.email,
            reason: error instanceof Error ? error.message : "Failed to import attendee"
          });
        }
      }
    }

    const matchedPreview = matchedRows.slice(0, MAX_ROWS_TO_RETURN).map((row) => ({
      attendeeName: row.attendee.name,
      attendeeEmail: row.attendee.email,
      organization: row.attendee.organization,
      title: row.attendee.title,
      joinTime: row.attendee.joinTime,
      leaveTime: row.attendee.leaveTime,
      durationMinutes: row.attendee.durationMinutes,
      healthSystemId: row.healthSystemId,
      healthSystemName: row.healthSystemName,
      healthSystemStrategy: row.healthSystemStrategy,
      healthSystemConfidence: row.healthSystemConfidence,
      existingContactId: row.existingContactId,
      existingContactName: row.existingContactName
    }));

    return NextResponse.json({
      dryRun: input.dryRun,
      company: {
        id: company.id,
        name: company.name
      },
      webinar: {
        id: webinarId,
        title: webinarTitle,
        startTime: webinarDetails?.startTime || null
      },
      screeningEvent:
        screeningEvent && !input.dryRun
          ? {
              id: screeningEvent.id,
              title: screeningEvent.title,
              type: screeningEvent.type,
              scheduledAt: screeningEvent.scheduledAt,
              completedAt: screeningEvent.completedAt
            }
          : null,
      summary: {
        participantsFetched: participants.length,
        registrantsFetched: registrants.length,
        registrantsAvailable: registrantFetchWarning ? false : true,
        dedupedAttendees: attendees.length,
        matchedAttendees: matchedRows.length,
        unresolvedAttendees: unresolvedRows.length,
        importedAttendees: importedRows.length,
        failedImports: importErrors.length
      },
      warnings: [registrantFetchWarning].filter((value): value is string => Boolean(value)),
      matched: matchedPreview,
      unresolved: unresolvedRows.slice(0, MAX_ROWS_TO_RETURN),
      imported: importedRows.slice(0, MAX_ROWS_TO_RETURN),
      importErrors: importErrors.slice(0, MAX_ROWS_TO_RETURN)
    });
  } catch (error) {
    console.error("zoom_webinar_import_error", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import Zoom webinar attendees."
      },
      { status: 400 }
    );
  }
}
