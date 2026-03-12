import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { marketLandscapePayloadFromRecord } from "@/lib/market-landscape";
import {
  inferDefaultDecisionFromCompany,
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

function computeDurationDays(createdAt: Date, closedAt: Date | null) {
  const startMs = createdAt.getTime();
  const endMs = (closedAt || new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function normalizeQuantitativeQuestionKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeQuantitativeCategory(category: string | null | undefined) {
  const raw = (category || "Uncategorized").trim();
  const normalized = normalizeQuantitativeQuestionKey(raw);
  if (!normalized) return raw;

  const exactAliasMap: Record<string, string> = {
    "co development interest": "Co-Development",
    "co-development interest": "Co-Development",
    "co development": "Co-Development",
    "co-development": "Co-Development",
    "desirability": "Desirability",
    "desirable": "Desirability",
    "desireability": "Desirability",
    "esirability": "Desirability",
    "feasability": "Feasibility",
    "feasibility": "Feasibility",
    "feasabiltiy": "Feasibility",
    "feasabilty": "Feasibility",
    "impact": "Impact and Viability",
    "viability": "Impact and Viability",
    "impact and viability": "Impact and Viability"
  };

  if (exactAliasMap[normalized]) return exactAliasMap[normalized];

  if (normalized.includes("co") && normalized.includes("develop")) return "Co-Development";
  if (normalized.includes("desir")) return "Desirability";
  if (normalized.includes("feas")) return "Feasibility";
  if (normalized.includes("impact") || normalized.includes("viabil")) return "Impact and Viability";

  return raw;
}

function makeQuantitativeQuestionKey(category: string | null | undefined, metric: string | null | undefined) {
  const canonicalCategory = canonicalizeQuantitativeCategory(category);
  return `${normalizeQuantitativeQuestionKey(canonicalCategory)}::${normalizeQuantitativeQuestionKey(metric)}`;
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
          orderBy: [{ updatedAt: "desc" }],
          include: {
            healthSystem: {
              select: { id: true, name: true }
            },
            contacts: {
              include: {
                contact: {
                  select: {
                    id: true,
                    name: true,
                    title: true,
                    email: true
                  }
                }
              },
              orderBy: [{ createdAt: "asc" }]
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
        },
        marketLandscape: {
          include: {
            cards: {
              orderBy: [{ sortOrder: "asc" }, { cellKey: "asc" }]
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
        affiliations: true,
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

    const attendeeHealthSystemIds = Array.from(
      new Set(
        company.screeningEvents.flatMap((event) =>
          event.participants.map((participant) => participant.healthSystemId)
        )
      )
    );
    const screeningMatrixHealthSystems = await prisma.healthSystem.findMany({
      where: {
        OR: [
          { isAllianceMember: true },
          { id: { in: attendeeHealthSystemIds } }
        ]
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }]
    });
    const screeningSurveyQuestions = await prisma.companyScreeningSurveyQuestion.findMany({
      select: {
        category: true,
        prompt: true,
        isActive: true
      }
    });
    const screeningSurveySessions = await prisma.companyScreeningSurveySession.findMany({
      where: { companyId: id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        status: true,
        updatedAt: true,
        questions: {
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          select: {
            categoryOverride: true,
            promptOverride: true,
            question: {
              select: {
                category: true,
                prompt: true
              }
            }
          }
        }
      }
    });
    const supplementalSurveyAnswers = await prisma.companyScreeningSurveyAnswer.findMany({
      where: {
        session: { companyId: id },
        score: { not: null },
        isSkipped: false,
        submission: {
          healthSystemId: null
        }
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        score: true,
        submission: {
          select: {
            participantName: true,
            participantEmail: true,
            healthSystem: {
              select: {
                name: true
              }
            },
            contact: {
              select: {
                name: true,
                title: true
              }
            }
          }
        },
        sessionQuestion: {
          select: {
            categoryOverride: true,
            promptOverride: true,
            question: {
              select: {
                category: true,
                prompt: true
              }
            }
          }
        }
      }
    });

    const activeQuestionKeys = new Set<string>();
    const inactiveQuestionKeys = new Set<string>();
    for (const question of screeningSurveyQuestions) {
      const key = makeQuantitativeQuestionKey(question.category, question.prompt);
      if (question.isActive) {
        activeQuestionKeys.add(key);
      } else {
        inactiveQuestionKeys.add(key);
      }
    }

    const activeSessionQuestionKeys = new Set<string>();
    for (const session of screeningSurveySessions) {
      for (const question of session.questions) {
        const key = makeQuantitativeQuestionKey(
          question.categoryOverride || question.question.category,
          question.promptOverride || question.question.prompt
        );
        activeSessionQuestionKeys.add(key);
      }
    }

    const supplementalQuantitativeResponses = supplementalSurveyAnswers.map((entry) => {
      const category = canonicalizeQuantitativeCategory(
        entry.sessionQuestion.categoryOverride || entry.sessionQuestion.question.category
      );
      const metric = entry.sessionQuestion.promptOverride || entry.sessionQuestion.question.prompt;
      const key = makeQuantitativeQuestionKey(category, metric);
      const score = toNumber(entry.score);
      return {
        id: entry.id,
        contactName:
          entry.submission.contact?.name ||
          entry.submission.participantName ||
          entry.submission.participantEmail ||
          "Unknown participant",
        contactTitle: entry.submission.contact?.title || null,
        institutionName: entry.submission.healthSystem?.name || "Unlinked survey response",
        category,
        metric,
        score,
        isDeprecatedQuestion:
          activeSessionQuestionKeys.size > 0
            ? !activeSessionQuestionKeys.has(key)
            : inactiveQuestionKeys.has(key) && !activeQuestionKeys.has(key)
      };
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

    const screeningHealthSystems = screeningMatrixHealthSystems.map((healthSystem) => {
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
        ).map((entry) => {
          const canonicalCategory = canonicalizeQuantitativeCategory(entry.category);
          return {
            id: entry.id,
            contactId: entry.contactId,
            contactName: entry.contact?.name || "Individual not linked",
            contactTitle: entry.contact?.title || null,
            category: canonicalCategory,
            metric: entry.metric,
            score: toNumber(entry.score),
            weightPercent: entry.weightPercent,
            notes: entry.notes,
            updatedAt: entry.updatedAt,
            isDeprecatedQuestion: (() => {
              const key = makeQuantitativeQuestionKey(canonicalCategory, entry.metric);
              if (activeSessionQuestionKeys.size > 0) {
                return !activeSessionQuestionKeys.has(key);
              }
              return inactiveQuestionKeys.has(key) && !activeQuestionKeys.has(key);
            })()
          };
        }),
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
        marketLandscape: marketLandscapePayloadFromRecord(company.marketLandscape, company.name),
        location: formatLocation(company),
        phase,
        phaseLabel: phaseLabel(phase),
        column,
        isScreeningStage: isScreeningPhase(phase),
        closedOutcome: company.pipeline?.closedOutcome ?? null,
        declineReasonNotes: company.pipeline?.declineReasonNotes ?? null,
        intakeDecision: company.pipeline?.intakeDecision ?? inferDefaultDecisionFromCompany(company),
        intakeDecisionAt: company.pipeline?.intakeDecisionAt ?? company.intakeScheduledAt ?? null,
        ventureStudioContractExecutedAt: company.pipeline?.ventureStudioContractExecutedAt ?? null,
        screeningWebinarDate1At: company.pipeline?.screeningWebinarDate1At ?? null,
        screeningWebinarDate2At: company.pipeline?.screeningWebinarDate2At ?? null,
        ventureLikelihoodPercent: company.pipeline?.ventureLikelihoodPercent ?? null,
        ventureExpectedCloseDate: company.pipeline?.ventureExpectedCloseDate ?? null,
        ownerName: company.pipeline?.ownerName ?? null,
        updatedAt: (company.pipeline?.updatedAt || company.updatedAt).toISOString(),
        opportunities: company.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          type: opportunity.type,
          stage: opportunity.stage,
          contractPriceUsd: opportunity.contractPriceUsd,
          durationDays: computeDurationDays(opportunity.createdAt, opportunity.closedAt),
          likelihoodPercent: opportunity.likelihoodPercent,
          nextSteps: opportunity.nextSteps,
          notes: opportunity.notes,
          closeReason: opportunity.closeReason,
          createdAt: opportunity.createdAt,
          estimatedCloseDate: opportunity.estimatedCloseDate,
          closedAt: opportunity.closedAt,
          updatedAt: opportunity.updatedAt,
          healthSystem: opportunity.healthSystem,
          contacts: opportunity.contacts.map((link) => ({
            id: link.id,
            role: link.role,
            createdAt: link.createdAt,
            contact: link.contact
          }))
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
          affiliations: Array.isArray(note.affiliations) ? note.affiliations : [],
          createdAt: note.createdAt,
          createdByName: note.createdByName || note.createdByUser?.name || note.createdByUser?.email || "Unknown user"
        })),
        screening: {
          healthSystems: screeningHealthSystems,
          supplementalQuantitativeResponses
        }
      }
    });
  } catch (error) {
    console.error("get_pipeline_opportunity_detail_error", error);
    return NextResponse.json({ error: "Failed to load pipeline opportunity detail" }, { status: 400 });
  }
}
