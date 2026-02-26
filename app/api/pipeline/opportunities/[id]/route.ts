import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  inferDefaultPhaseFromCompany,
  isScreeningPhase,
  mapPhaseToBoardColumn,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

function formatLocation(company: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  return [company.headquartersCity, company.headquartersState, company.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function toNumber(value: { toString(): string } | null | undefined) {
  if (!value) return null;
  const numeric = Number(value.toString());
  return Number.isFinite(numeric) ? numeric : null;
}

function latestNoteEntry(notes: string | null | undefined) {
  const segments = (notes || "")
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return "";
  const raw = segments[segments.length - 1];
  return raw.replace(/^\[[^\]]+\]\s*/, "").trim();
}

const ventureStudioAssessmentValues = ["red", "yellow", "green", "grey"] as const;
type VentureStudioAssessment = (typeof ventureStudioAssessmentValues)[number];

function sanitizeVentureStudioAssessment(value: unknown): VentureStudioAssessment | null {
  return ventureStudioAssessmentValues.includes(value as VentureStudioAssessment) ? (value as VentureStudioAssessment) : null;
}

function sanitizeVentureStudioCriteria(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const typedEntry = entry as { category?: unknown; assessment?: unknown; rationale?: unknown };
      const category = typeof typedEntry.category === "string" ? typedEntry.category.trim() : "";
      const rationale = typeof typedEntry.rationale === "string" ? typedEntry.rationale : "";
      const assessment = sanitizeVentureStudioAssessment(typedEntry.assessment);
      if (!category) return null;
      return {
        category,
        rationale,
        assessment: assessment || "grey"
      };
    })
    .filter((entry): entry is { category: string; assessment: VentureStudioAssessment; rationale: string } => Boolean(entry));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        pipeline: true,
        opportunities: {
          where: {
            stage: {
              notIn: ["CLOSED_WON", "CLOSED_LOST"]
            }
          },
          orderBy: [{ updatedAt: "desc" }],
          include: {
            healthSystem: {
              select: { id: true, name: true }
            }
          }
        },
        documents: {
          orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }]
        },
        lois: {
          include: {
            healthSystem: {
              select: { id: true, name: true }
            }
          }
        },
        screeningDocuments: {
          orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }],
          include: {
            healthSystem: {
              select: { id: true, name: true }
            }
          }
        },
        screeningEvents: {
          orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
          include: {
            participants: {
              orderBy: [{ createdAt: "asc" }],
              include: {
                contact: {
                  select: {
                    id: true,
                    name: true,
                    title: true
                  }
                }
              }
            }
          }
        },
        screeningQuantitativeFeedback: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                title: true
              }
            }
          }
        },
        screeningQualitativeFeedback: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                title: true
              }
            }
          }
        },
        screeningCellChanges: {
          orderBy: [{ createdAt: "desc" }],
          include: {
            changedByUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const entityNotes = await prisma.entityNote.findMany({
      where: {
        entityKind: "COMPANY",
        entityId: company.id
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        note: true,
        createdAt: true,
        createdByName: true,
        createdByUser: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    const phase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
    const column = mapPhaseToBoardColumn(phase);

    const allianceHealthSystems = await prisma.healthSystem.findMany({
      where: { isAllianceMember: true },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }]
    });

    const loiByHealthSystemId = new Map(
      company.lois.map((entry) => [entry.healthSystemId, entry])
    );
    const screeningDocumentsByHealthSystemId = new Map<string, typeof company.screeningDocuments>();
    const screeningParticipantsByHealthSystemId = new Map<
      string,
      Array<{
        id: string;
        contactId: string | null;
        contactName: string;
        contactTitle: string | null;
        attendanceStatus: string;
        eventId: string;
        eventTitle: string;
        eventType: string;
        eventScheduledAt: Date | null;
        eventCompletedAt: Date | null;
        notes: string | null;
      }>
    >();
    const screeningQuantitativeFeedbackByHealthSystemId = new Map<
      string,
      typeof company.screeningQuantitativeFeedback
    >();
    const screeningQualitativeFeedbackByHealthSystemId = new Map<
      string,
      typeof company.screeningQualitativeFeedback
    >();
    const screeningCellChangesByHealthSystemId = new Map<
      string,
      Array<{
        id: string;
        field: "RELEVANT_FEEDBACK" | "STATUS_UPDATE";
        value: string;
        createdAt: Date;
        changedByUserId: string | null;
        changedByName: string | null;
        changedByUser: { id: string; name: string | null; email: string } | null;
      }>
    >();

    for (const document of company.screeningDocuments) {
      const existing = screeningDocumentsByHealthSystemId.get(document.healthSystemId) || [];
      existing.push(document);
      screeningDocumentsByHealthSystemId.set(document.healthSystemId, existing);
    }

    for (const event of company.screeningEvents) {
      for (const participant of event.participants) {
        const existing = screeningParticipantsByHealthSystemId.get(participant.healthSystemId) || [];
        existing.push({
          id: participant.id,
          contactId: participant.contactId,
          contactName: participant.contact?.name || "Individual not linked",
          contactTitle: participant.contact?.title || null,
          attendanceStatus: participant.attendanceStatus,
          eventId: event.id,
          eventTitle: event.title,
          eventType: event.type,
          eventScheduledAt: event.scheduledAt,
          eventCompletedAt: event.completedAt,
          notes: participant.notes
        });
        screeningParticipantsByHealthSystemId.set(participant.healthSystemId, existing);
      }
    }

    for (const entry of company.screeningQuantitativeFeedback) {
      const existing = screeningQuantitativeFeedbackByHealthSystemId.get(entry.healthSystemId) || [];
      existing.push(entry);
      screeningQuantitativeFeedbackByHealthSystemId.set(entry.healthSystemId, existing);
    }

    for (const entry of company.screeningQualitativeFeedback) {
      const existing = screeningQualitativeFeedbackByHealthSystemId.get(entry.healthSystemId) || [];
      existing.push(entry);
      screeningQualitativeFeedbackByHealthSystemId.set(entry.healthSystemId, existing);
    }

    for (const change of company.screeningCellChanges) {
      const existing = screeningCellChangesByHealthSystemId.get(change.healthSystemId) || [];
      existing.push({
        id: change.id,
        field: change.field,
        value: change.value,
        createdAt: change.createdAt,
        changedByUserId: change.changedByUserId,
        changedByName: change.changedByName,
        changedByUser: change.changedByUser
      });
      screeningCellChangesByHealthSystemId.set(change.healthSystemId, existing);
    }

    const screeningHealthSystems = allianceHealthSystems.map((healthSystem) => {
      const loi = loiByHealthSystemId.get(healthSystem.id);
      const cellChanges = screeningCellChangesByHealthSystemId.get(healthSystem.id) || [];
      const relevantFeedbackHistory = cellChanges
        .filter((change) => change.field === "RELEVANT_FEEDBACK")
        .map((change) => ({
          id: change.id,
          value: change.value,
          changedAt: change.createdAt,
          changedByUserId: change.changedByUserId,
          changedByName:
            change.changedByName || change.changedByUser?.name || change.changedByUser?.email || "Unknown user"
        }))
        .slice(0, 25);
      const statusUpdateHistory = cellChanges
        .filter((change) => change.field === "STATUS_UPDATE")
        .map((change) => ({
          id: change.id,
          value: change.value,
          changedAt: change.createdAt,
          changedByUserId: change.changedByUserId,
          changedByName:
            change.changedByName || change.changedByUser?.name || change.changedByUser?.email || "Unknown user"
        }))
        .slice(0, 25);
      const fallbackRelevantFeedback =
        (screeningQualitativeFeedbackByHealthSystemId.get(healthSystem.id) || [])[0]?.feedback ||
        (screeningQuantitativeFeedbackByHealthSystemId.get(healthSystem.id) || [])[0]?.notes ||
        "";
      const fallbackStatusUpdate = latestNoteEntry(loi?.notes);
      return {
        healthSystemId: healthSystem.id,
        healthSystemName: healthSystem.name,
        status: loi?.status || "NOT_STARTED",
        notes: loi?.notes || "",
        statusUpdatedAt: loi?.statusUpdatedAt || null,
        relevantFeedback: relevantFeedbackHistory[0]?.value || fallbackRelevantFeedback,
        statusUpdate: statusUpdateHistory[0]?.value || fallbackStatusUpdate,
        relevantFeedbackHistory,
        statusUpdateHistory,
        participants: (screeningParticipantsByHealthSystemId.get(healthSystem.id) || []).map((participant) => ({
          id: participant.id,
          contactId: participant.contactId,
          contactName: participant.contactName,
          contactTitle: participant.contactTitle,
          attendanceStatus: participant.attendanceStatus,
          eventId: participant.eventId,
          eventTitle: participant.eventTitle,
          eventType: participant.eventType,
          eventScheduledAt: participant.eventScheduledAt,
          eventCompletedAt: participant.eventCompletedAt,
          notes: participant.notes
        })),
        documents: (screeningDocumentsByHealthSystemId.get(healthSystem.id) || []).map((document) => ({
          id: document.id,
          title: document.title,
          url: document.url,
          notes: document.notes,
          uploadedAt: document.uploadedAt
        })),
        quantitativeFeedback: (
          screeningQuantitativeFeedbackByHealthSystemId.get(healthSystem.id) || []
        ).map((entry) => ({
          id: entry.id,
          contactId: entry.contactId,
          contactName: entry.contact?.name || "Individual not linked",
          contactTitle: entry.contact?.title || null,
          category: entry.category,
          metric: entry.metric,
          score: toNumber(entry.score),
          weightPercent: entry.weightPercent,
          notes: entry.notes,
          updatedAt: entry.updatedAt
        })),
        qualitativeFeedback: (
          screeningQualitativeFeedbackByHealthSystemId.get(healthSystem.id) || []
        ).map((entry) => ({
          id: entry.id,
          contactId: entry.contactId,
          contactName: entry.contact?.name || "Individual not linked",
          contactTitle: entry.contact?.title || null,
          category: entry.category,
          theme: entry.theme,
          sentiment: entry.sentiment,
          feedback: entry.feedback,
          updatedAt: entry.updatedAt
        }))
      };
    });

    return NextResponse.json({
      item: {
        id: company.id,
        name: company.name,
        website: company.website,
        description: company.description,
        atAGlanceProblem: company.atAGlanceProblem,
        atAGlanceSolution: company.atAGlanceSolution,
        atAGlanceImpact: company.atAGlanceImpact,
        atAGlanceKeyStrengths: company.atAGlanceKeyStrengths,
        atAGlanceKeyConsiderations: company.atAGlanceKeyConsiderations,
        ventureStudioCriteria: sanitizeVentureStudioCriteria(company.pipeline?.ventureStudioCriteria),
        location: formatLocation(company),
        phase,
        phaseLabel: phaseLabel(phase),
        column,
        isScreeningStage: isScreeningPhase(phase),
        opportunities: company.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          type: opportunity.type,
          stage: opportunity.stage,
          amountUsd: opportunity.amountUsd,
          likelihoodPercent: opportunity.likelihoodPercent,
          nextSteps: opportunity.nextSteps,
          notes: opportunity.notes,
          estimatedCloseDate: opportunity.estimatedCloseDate,
          updatedAt: opportunity.updatedAt,
          healthSystem: opportunity.healthSystem
        })),
        documents: company.documents.map((document) => ({
          id: document.id,
          type: document.type,
          title: document.title,
          url: document.url,
          notes: document.notes,
          uploadedAt: document.uploadedAt
        })),
        notes: entityNotes.map((note) => ({
          id: note.id,
          note: note.note,
          createdAt: note.createdAt,
          createdByName: note.createdByName || note.createdByUser?.name || note.createdByUser?.email || "Unknown user"
        })),
        screening: {
          healthSystems: screeningHealthSystems
        }
      }
    });
  } catch (error) {
    console.error("get_pipeline_opportunity_detail_error", error);
    return NextResponse.json({ error: "Failed to load pipeline opportunity detail" }, { status: 400 });
  }
}
