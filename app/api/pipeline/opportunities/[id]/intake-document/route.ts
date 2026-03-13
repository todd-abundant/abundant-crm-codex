import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { marketLandscapePayloadFromRecord } from "@/lib/market-landscape";
import { buildPipelineIntakeReportPayload } from "@/lib/pipeline-intake-report";
import { mapOpportunityStageToCurrentInterest } from "@/lib/screening-interest";
import {
  IntakeSlidesGenerationError,
  cleanupIntakeReportsOnDrive,
  createIntakeSlidesFromTemplate
} from "@/lib/google-slides-intake";

const createIntakeReportSchema = z.object({
  force: z.boolean().optional().default(false)
});

function toDocumentPayload(document: {
  id: string;
  type: string;
  title: string;
  url: string;
  notes: string | null;
  uploadedAt: Date;
}) {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    url: document.url,
    notes: document.notes,
    uploadedAt: document.uploadedAt
  };
}

function safeCreatedByName(
  note: {
    createdByName: string | null;
    createdByUser: { name: string | null; email: string | null } | null;
  }
) {
  return note.createdByName || note.createdByUser?.name || note.createdByUser?.email || null;
}

function formatReportTitle(companyName: string) {
  const today = new Date();
  const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return `${companyName} - Intake Report - ${formattedDate}`;
}

function buildIntakeReportSource(
  company: {
    name: string;
    leadSourceHealthSystem: { name: string } | null;
    website: string | null;
    headquartersCity: string | null;
    headquartersState: string | null;
    headquartersCountry: string | null;
    description: string | null;
    atAGlanceProblem: string | null;
    atAGlanceSolution: string | null;
    atAGlanceImpact: string | null;
    atAGlanceKeyStrengths: string | null;
    atAGlanceKeyConsiderations: string | null;
    pipeline: { nextStep: string | null; ventureStudioCriteria: unknown } | null;
    marketLandscape: {
      sectionLabel: string;
      headline: string;
      subheadline: string;
      template: string;
      xAxisLabel: string;
      yAxisLabel: string;
      columnLabel1: string;
      columnLabel2: string;
      rowLabel1: string;
      rowLabel2: string;
      primaryFocusCellKey: string | null;
      cards: Array<{
        id: string;
        cellKey: string;
        title: string;
        overview: string;
        businessModel: string;
        strengths: string;
        gaps: string;
        vendors: string;
      }>;
    } | null;
    screeningCellChanges: Array<{
      healthSystemId: string;
      field: "RELEVANT_FEEDBACK" | "STATUS_UPDATE" | "MEMBER_FEEDBACK_STATUS";
      value: string;
    }>;
    screeningQualitativeFeedback: Array<{ healthSystemId: string; feedback: string | null }>;
    screeningQuantitativeFeedback: Array<{ healthSystemId: string; notes: string | null }>;
    opportunities: Array<{
      healthSystemId: string | null;
      type: string;
      stage: string;
      updatedAt: Date;
      memberFeedbackStatus: string | null;
    }>;
    lois: Array<{
      healthSystemId: string;
      status: string;
      statusUpdatedAt: Date | null;
    }>;
    screeningDocuments: Array<{
      title: string;
      url: string;
      healthSystem: { id: string; name: string } | null;
    }>;
  },
  healthSystems: Array<{ id: string; name: string }>,
  notes: Array<{
    note: string;
    createdAt: Date;
    createdByName: string | null;
    createdByUser: { name: string | null; email: string | null } | null;
  }>
) {
  const screeningCellChangesByHealthSystemId = new Map<string, typeof company.screeningCellChanges>();
  for (const entry of company.screeningCellChanges) {
    const existing = screeningCellChangesByHealthSystemId.get(entry.healthSystemId) || [];
    existing.push(entry);
    screeningCellChangesByHealthSystemId.set(entry.healthSystemId, existing);
  }

  const quantitativeByHealthSystemId = new Map<string, typeof company.screeningQuantitativeFeedback>();
  for (const entry of company.screeningQuantitativeFeedback) {
    const existing = quantitativeByHealthSystemId.get(entry.healthSystemId) || [];
    existing.push(entry);
    quantitativeByHealthSystemId.set(entry.healthSystemId, existing);
  }

  const qualitativeByHealthSystemId = new Map<string, typeof company.screeningQualitativeFeedback>();
  for (const entry of company.screeningQualitativeFeedback) {
    const existing = qualitativeByHealthSystemId.get(entry.healthSystemId) || [];
    existing.push(entry);
    qualitativeByHealthSystemId.set(entry.healthSystemId, existing);
  }

  const loiByHealthSystemId = new Map<string, (typeof company.lois)[number]>();
  for (const entry of company.lois) {
    loiByHealthSystemId.set(entry.healthSystemId, entry);
  }

  const screeningOpportunityByHealthSystemId = new Map<string, (typeof company.opportunities)[number]>();
  for (const entry of company.opportunities) {
    if (entry.type !== "SCREENING_LOI" || !entry.healthSystemId) continue;
    const existing = screeningOpportunityByHealthSystemId.get(entry.healthSystemId);
    const existingClosed = existing?.stage === "CLOSED_WON" || existing?.stage === "CLOSED_LOST";
    const nextClosed = entry.stage === "CLOSED_WON" || entry.stage === "CLOSED_LOST";
    if (!existing || (existingClosed && !nextClosed)) {
      screeningOpportunityByHealthSystemId.set(entry.healthSystemId, entry);
    }
  }

  const screeningHealthSystemSummaries = healthSystems.map((healthSystem) => {
    const screeningOpportunity = screeningOpportunityByHealthSystemId.get(healthSystem.id);
    const relevantChange = screeningCellChangesByHealthSystemId
      .get(healthSystem.id)
      ?.find((entry) => entry.field === "RELEVANT_FEEDBACK")?.value;
    const statusChange = screeningCellChangesByHealthSystemId
      .get(healthSystem.id)
      ?.find((entry) => entry.field === "STATUS_UPDATE")?.value;
    const memberFeedbackStatusChange = screeningCellChangesByHealthSystemId
      .get(healthSystem.id)
      ?.find((entry) => entry.field === "MEMBER_FEEDBACK_STATUS")?.value;
    const statusUpdatedAt =
      screeningOpportunity?.updatedAt || loiByHealthSystemId.get(healthSystem.id)?.statusUpdatedAt || null;
    const currentInterest = mapOpportunityStageToCurrentInterest(
      (screeningOpportunity?.stage as
        | "IDENTIFIED"
        | "QUALIFICATION"
        | "PROPOSAL"
        | "NEGOTIATION"
        | "LEGAL"
        | "CLOSED_WON"
        | "CLOSED_LOST"
        | "ON_HOLD"
        | null
        | undefined) || null
    );
    const fallbackRelevant =
      (qualitativeByHealthSystemId.get(healthSystem.id) || [])[0]?.feedback || "";
    const fallbackStatusUpdate =
      (quantitativeByHealthSystemId.get(healthSystem.id) || [])[0]?.notes || "";
    const memberFeedbackStatus =
      screeningOpportunity?.memberFeedbackStatus ||
      memberFeedbackStatusChange ||
      [relevantChange, statusChange, fallbackRelevant, fallbackStatusUpdate]
        .map((value) => (value || "").trim())
        .filter(Boolean)
        .join("\n\n") ||
      null;

    return {
      healthSystemName: healthSystem.name,
      status: currentInterest.label,
      statusUpdatedAt,
      preliminaryInterest: null,
      currentInterest: currentInterest.label,
      memberFeedbackStatus,
      relevantFeedback: relevantChange || memberFeedbackStatus || fallbackRelevant || null,
      statusUpdate: statusChange || memberFeedbackStatus || fallbackStatusUpdate || null
    };
  });

  const screeningDocuments = company.screeningDocuments.map((document) => ({
    title: document.title,
    url: document.url,
    healthSystemName: document.healthSystem?.name || null
  }));

  return {
    companyName: company.name,
    leadSourceHealthSystemName: company.leadSourceHealthSystem?.name || null,
    website: company.website,
    headquartersCity: company.headquartersCity,
    headquartersState: company.headquartersState,
    headquartersCountry: company.headquartersCountry,
    description: company.description,
    atAGlanceProblem: company.atAGlanceProblem,
    atAGlanceSolution: company.atAGlanceSolution,
    atAGlanceImpact: company.atAGlanceImpact,
    atAGlanceKeyStrengths: company.atAGlanceKeyStrengths,
    atAGlanceKeyConsiderations: company.atAGlanceKeyConsiderations,
    marketLandscape: marketLandscapePayloadFromRecord(company.marketLandscape, company.name),
    ventureStudioCriteria: company.pipeline?.ventureStudioCriteria || null,
    nextStep: company.pipeline?.nextStep || null,
    notes: notes.map((note) => ({
      note: note.note,
      createdAt: note.createdAt,
      createdByName: safeCreatedByName(note),
      createdByUser: note.createdByUser
    })),
    screeningHealthSystemSummaries,
    screeningDocuments
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON?.trim()) {
      return NextResponse.json(
        {
          error:
            "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is missing. Add a valid service-account JSON payload for report generation."
        },
        { status: 500 }
      );
    }

    const input = createIntakeReportSchema.parse(await request.json().catch(() => ({})));

    const [company, existingReports, notes, allianceHealthSystems] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: {
          leadSourceHealthSystem: {
            select: { name: true }
          },
          pipeline: true,
          marketLandscape: {
            include: {
              cards: {
                orderBy: [{ sortOrder: "asc" }, { cellKey: "asc" }]
              }
            }
          },
          lois: {
            select: {
              healthSystemId: true,
              status: true,
              statusUpdatedAt: true
            }
          },
          opportunities: {
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            select: {
              healthSystemId: true,
              type: true,
              stage: true,
              updatedAt: true,
              memberFeedbackStatus: true
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
          screeningCellChanges: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              healthSystemId: true,
              field: true,
              value: true,
              createdAt: true
            }
          },
          screeningQualitativeFeedback: {
            orderBy: [{ updatedAt: "desc" }],
            select: {
              healthSystemId: true,
              feedback: true
            }
          },
          screeningQuantitativeFeedback: {
            orderBy: [{ updatedAt: "desc" }],
            select: {
              healthSystemId: true,
              notes: true
            }
          }
        }
      }),
      prisma.companyDocument.findMany({
        where: { companyId, type: "INTAKE_REPORT" },
        orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          type: true,
          title: true,
          url: true,
          notes: true,
          uploadedAt: true
        }
      }),
      prisma.entityNote.findMany({
        where: { entityKind: "COMPANY", entityId: companyId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
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
      }),
      prisma.healthSystem.findMany({
        where: { isAllianceMember: true },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }]
      })
    ]);

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    if (existingReports.length > 0 && !input.force) {
      return NextResponse.json(
        {
          error: "An Intake Report already exists for this company. Use force=true to recreate it.",
          document: toDocumentPayload(existingReports[0])
        },
        { status: 409 }
      );
    }

    if (input.force && existingReports.length > 0) {
      try {
        await cleanupIntakeReportsOnDrive(existingReports.map((entry) => entry.url));
      } catch (error) {
        if (error instanceof IntakeSlidesGenerationError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        return NextResponse.json(
          { error: "Failed to clean up existing intake reports. Resolve Drive access/permissions and retry with force=true." },
          { status: 502 }
        );
      }
    }

    const templateId = process.env.GOOGLE_INTAKE_SLIDES_TEMPLATE_ID?.trim();
    if (!templateId) {
      return NextResponse.json(
        {
          error:
            "GOOGLE_INTAKE_SLIDES_TEMPLATE_ID is not configured. Set GOOGLE_INTAKE_SLIDES_TEMPLATE_ID to a Google Slides template before generating intake reports."
        },
        { status: 400 }
      );
    }

    const reportSource = buildIntakeReportSource(
      company,
      allianceHealthSystems,
      notes.map((note) => ({
        note: note.note,
        createdAt: note.createdAt,
        createdByName: note.createdByName,
        createdByUser: note.createdByUser
      }))
    );
    const values = buildPipelineIntakeReportPayload(reportSource);
    const reportTitle = formatReportTitle(company.name);

    const generated = await createIntakeSlidesFromTemplate({
      templateId,
      templateTitle: reportTitle,
      values,
      userEmail: user.email
    });

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.companyDocument.create({
        data: {
          companyId,
          type: "INTAKE_REPORT",
          title: generated.title,
          url: generated.url,
          notes: "Generated from Intake Report template."
        },
        select: {
          id: true,
          type: true,
          title: true,
          url: true,
          notes: true,
          uploadedAt: true
        }
      });

      if (input.force) {
        await tx.companyDocument.deleteMany({
          where: {
            companyId,
            type: "INTAKE_REPORT",
            id: { not: created.id }
          }
        });
      }

      return created;
    });

    const response = NextResponse.json(
      {
        document: toDocumentPayload(document),
        storageHint: generated.storageHint,
        driveFolderMode: generated.driveFolderMode
      },
      { status: 201 }
    );

    return response;
  } catch (error) {
    if (error instanceof IntakeSlidesGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    console.error("generate_pipeline_intake_document_error", error);
    return NextResponse.json({ error: "Failed to generate intake report." }, { status: 400 });
  }
}
