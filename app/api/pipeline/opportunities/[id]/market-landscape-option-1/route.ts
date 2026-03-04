import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { getCurrentUser, readGoogleApiSession, setGoogleApiSession } from "@/lib/auth/server";
import { extractDriveFileIdFromUrl } from "@/lib/google-slides-intake";

const MARKET_LANDSCAPE_OPTION_1_MARKER = "MARKET_LANDSCAPE_V1";
const MARKET_LANDSCAPE_MARKER_TOKEN = "{{MARKET_LANDSCAPE_SLIDE_MARKER}}";

function isGoogleOauthReauthError(error: unknown) {
  const asAny = error as {
    message?: string;
    response?: { data?: { error?: { message?: string; errors?: { reason?: string }[] } } };
  };

  const message = asAny?.message;
  if (typeof message === "string") {
    const lower = message.toLowerCase();
    if (lower.includes("invalid_grant")) return true;
    if (lower.includes("invalid credentials")) return true;
    if (lower.includes("token has been expired")) return true;
  }

  const reasons = asAny?.response?.data?.error?.errors;
  if (
    Array.isArray(reasons) &&
    reasons.some((item) => item?.reason === "authError" || item?.reason === "invalidCredentials")
  ) {
    return true;
  }

  return false;
}

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

    const googleApiSession = await readGoogleApiSession();
    const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!googleClientId || !googleClientSecret) {
      return NextResponse.json(
        {
          error:
            "Google OAuth client credentials are not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        },
        { status: 500 }
      );
    }

    if (!googleApiSession || googleApiSession.userId !== user.id || !googleApiSession.accessToken) {
      return NextResponse.json(
        {
          error:
            "Google Drive authorization for this account is missing or expired. Sign out and sign back in, then retry."
        },
        { status: 401 }
      );
    }

    if (
      googleApiSession.scope &&
      (!googleApiSession.scope.includes("https://www.googleapis.com/auth/drive") ||
        !googleApiSession.scope.includes("https://www.googleapis.com/auth/presentations"))
    ) {
      return NextResponse.json(
        {
          error:
            "Google Drive/Slides scopes are missing for your session. Sign out and sign back in to grant updated permissions."
        },
        { status: 401 }
      );
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

    const oauth = new google.auth.OAuth2(googleClientId, googleClientSecret);
    oauth.setCredentials({
      access_token: googleApiSession.accessToken,
      refresh_token: googleApiSession.refreshToken || undefined,
      expiry_date:
        typeof googleApiSession.accessTokenExpiresAt === "number" && Number.isFinite(googleApiSession.accessTokenExpiresAt)
          ? googleApiSession.accessTokenExpiresAt
          : undefined
    });

    let latestAccessToken = googleApiSession.accessToken;
    let latestRefreshToken = googleApiSession.refreshToken || null;
    let latestAccessTokenExpiresAt =
      typeof googleApiSession.accessTokenExpiresAt === "number" && Number.isFinite(googleApiSession.accessTokenExpiresAt)
        ? googleApiSession.accessTokenExpiresAt
        : null;

    oauth.on("tokens", (tokens) => {
      if (tokens.access_token) latestAccessToken = tokens.access_token;
      if (typeof tokens.refresh_token === "string") latestRefreshToken = tokens.refresh_token;
      if (typeof tokens.expiry_date === "number" && Number.isFinite(tokens.expiry_date)) {
        latestAccessTokenExpiresAt = tokens.expiry_date;
      }
    });

    const slides = google.slides({ version: "v1", auth: oauth });

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

    const response = NextResponse.json({
      kind: "ok" as const,
      presentationId,
      presentationUrl,
      slideObjectId,
      slideEditUrl,
      thumbnailUrl: slideObjectId
        ? `/api/pipeline/opportunities/${companyId}/market-landscape-option-1/thumbnail`
        : null
    });

    if (
      latestAccessToken &&
      (latestAccessToken !== googleApiSession.accessToken ||
        latestRefreshToken !== googleApiSession.refreshToken ||
        latestAccessTokenExpiresAt !== googleApiSession.accessTokenExpiresAt)
    ) {
      await setGoogleApiSession(response, {
        userId: user.id,
        email: user.email,
        accessToken: latestAccessToken,
        refreshToken: latestRefreshToken,
        tokenType: googleApiSession.tokenType,
        scope: googleApiSession.scope,
        accessTokenExpiresAt: latestAccessTokenExpiresAt
      });
    }

    return response;
  } catch (error) {
    if (isGoogleOauthReauthError(error)) {
      return NextResponse.json(
        {
          error:
            "Google Drive authorization for this account is missing or expired. Sign out and sign back in, then retry."
        },
        { status: 401 }
      );
    }

    console.error("market_landscape_option1_info_error", error);
    return NextResponse.json({ error: "Failed to load Market Landscape Option 1 slide." }, { status: 400 });
  }
}
