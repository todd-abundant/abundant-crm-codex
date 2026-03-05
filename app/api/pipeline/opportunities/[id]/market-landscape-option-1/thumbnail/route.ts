import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { extractDriveFileIdFromUrl } from "@/lib/google-slides-intake";
import {
  createGoogleServiceAccountAuth,
  GoogleServiceAccountConfigError,
  resolveGoogleServiceAccountAccessToken
} from "@/lib/google-service-account";

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

async function fetchThumbnailContent(contentUrl: string, accessToken: string | null) {
  const withAuth = accessToken
    ? await fetch(contentUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
    : null;
  if (withAuth?.ok) return withAuth;

  const withoutAuth = await fetch(contentUrl);
  if (withoutAuth.ok) return withoutAuth;

  return withAuth || withoutAuth;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: companyId } = await context.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const intakeReport = await prisma.companyDocument.findFirst({
      where: { companyId, type: "INTAKE_REPORT" },
      orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }],
      select: { url: true }
    });

    if (!intakeReport) {
      return NextResponse.json({ error: "Intake Document not found." }, { status: 404 });
    }

    const presentationId = extractDriveFileIdFromUrl(intakeReport.url);
    if (!presentationId) {
      return NextResponse.json(
        { error: "Unable to parse the Google Slides file id from the saved Intake Document URL." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh");

    const auth = createGoogleServiceAccountAuth();
    const slides = google.slides({ version: "v1", auth });

    const presentation = await slides.presentations.get({
      presentationId,
      fields: "slides(objectId,pageElements(shape(text(textElements(textRun(content))))))"
    });

    const matchedSlide = (presentation.data.slides || []).find((slide) => slideContainsMarker(slide));
    const slideObjectId = matchedSlide?.objectId || null;
    if (!slideObjectId) {
      return NextResponse.json({ error: "Market Landscape slide marker was not found in the Intake Document." }, { status: 404 });
    }

    const thumbnail = await slides.presentations.pages.getThumbnail({
      presentationId,
      pageObjectId: slideObjectId
    });

    const contentUrl = thumbnail.data.contentUrl;
    if (!contentUrl) {
      return NextResponse.json({ error: "Google Slides did not return a thumbnail URL." }, { status: 502 });
    }

    const accessToken = await resolveGoogleServiceAccountAccessToken(auth);
    const imageResponse = await fetchThumbnailContent(contentUrl, accessToken);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch thumbnail content (${imageResponse.status}).` },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": forceRefresh ? "no-store" : "private, max-age=60"
      }
    });

    return response;
  } catch (error) {
    if (error instanceof GoogleServiceAccountConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error("market_landscape_option1_thumbnail_error", error);
    return NextResponse.json({ error: "Failed to load Market Landscape Option 1 thumbnail." }, { status: 400 });
  }
}
