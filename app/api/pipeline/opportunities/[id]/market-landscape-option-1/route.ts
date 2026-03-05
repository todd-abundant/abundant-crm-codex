import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { extractDriveFileIdFromUrl } from "@/lib/google-slides-intake";
import { createGoogleServiceAccountAuth, GoogleServiceAccountConfigError } from "@/lib/google-service-account";

const MARKET_LANDSCAPE_OPTION_1_MARKER = "MARKET_LANDSCAPE_V1";
const MARKET_LANDSCAPE_MARKER_TOKEN = "{{MARKET_LANDSCAPE_SLIDE_MARKER}}";

function shapeText(
  shape: {
    text?: { textElements?: Array<{ textRun?: { content?: string | null } | null } | null> | null } | null;
  } | null | undefined
) {
  const elements = shape?.text?.textElements || [];
  return elements
    .map((element) => element?.textRun?.content || "")
    .filter(Boolean)
    .join("");
}

function slideContainsMarker(slide?: { pageElements?: Array<{ shape?: unknown } | null> | null }) {
  const pageElements = slide?.pageElements || [];
  for (const element of pageElements) {
    const asAny = element as { shape?: { text?: { textElements?: Array<{ textRun?: { content?: string | null } | null } | null> | null } | null } | null };
    const text = shapeText(asAny.shape);
    if (!text) continue;
    if (text.includes(MARKET_LANDSCAPE_OPTION_1_MARKER) || text.includes(MARKET_LANDSCAPE_MARKER_TOKEN)) {
      return true;
    }
  }
  return false;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: companyId } = await context.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const latestIntakeReport = await prisma.companyDocument.findFirst({
      where: { companyId, type: "INTAKE_REPORT" },
      orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, url: true, title: true }
    });

    if (!latestIntakeReport) {
      return NextResponse.json({ kind: "missing_intake_document" as const });
    }

    const presentationId = extractDriveFileIdFromUrl(latestIntakeReport.url);
    if (!presentationId) {
      return NextResponse.json({
        kind: "invalid_intake_document" as const,
        message: "Unable to parse the Google Slides file id from the saved Intake Document URL."
      });
    }

    const auth = createGoogleServiceAccountAuth();
    const slides = google.slides({ version: "v1", auth });

    const presentation = await slides.presentations.get({
      presentationId,
      fields: "slides(objectId,pageElements(shape(text(textElements(textRun(content))))))"
    });

    const matchedSlide = (presentation.data.slides || []).find((slide) => slideContainsMarker(slide));
    const slideObjectId = matchedSlide?.objectId || null;
    const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;
    const slideEditUrl = slideObjectId
      ? `https://docs.google.com/presentation/d/${presentationId}/edit#slide=id.${slideObjectId}`
      : null;

    return NextResponse.json({
      kind: "ok" as const,
      presentationId,
      presentationUrl,
      slideObjectId,
      slideEditUrl,
      thumbnailUrl: slideObjectId
        ? `/api/pipeline/opportunities/${companyId}/market-landscape-option-1/thumbnail`
        : null
    });
  } catch (error) {
    if (error instanceof GoogleServiceAccountConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error("market_landscape_option1_info_error", error);
    return NextResponse.json({ error: "Failed to load Market Landscape Option 1 slide." }, { status: 400 });
  }
}
