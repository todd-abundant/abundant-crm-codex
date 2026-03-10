import { NextResponse } from "next/server";
import { z } from "zod";
import { google } from "googleapis";
import type { JWT, OAuth2Client } from "google-auth-library";
import { getCurrentUser, readGoogleApiSession } from "@/lib/auth/server";
import { createGoogleServiceAccountAuth, GoogleServiceAccountConfigError } from "@/lib/google-service-account";
import { extractGoogleDriveFileId, normalizeGoogleDocsUrl } from "@/lib/company-document-links";

const requestSchema = z.object({
  url: z.string().min(1)
});

async function getDriveDocumentTitle(fileId: string, auth: OAuth2Client | JWT) {
  const drive = google.drive({ version: "v3", auth });
  const file = await drive.files.get({
    fileId,
    fields: "name",
    supportsAllDrives: true
  });
  return file.data.name?.trim() || null;
}

function createUserDriveClient(session: Awaited<ReturnType<typeof readGoogleApiSession>>) {
  if (!session?.accessToken) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken || undefined,
    expiry_date: session.accessTokenExpiresAt || undefined
  });
  return oauth;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const normalizedUrl = normalizeGoogleDocsUrl(parsed.data.url);
    if (!normalizedUrl) {
      return NextResponse.json({ error: "Unable to parse a supported Google document URL." }, { status: 400 });
    }

    const fileId = extractGoogleDriveFileId(normalizedUrl);
    if (!fileId) {
      return NextResponse.json({ error: "Unable to extract Google Drive file ID from URL." }, { status: 400 });
    }

    const googleApiSession = await readGoogleApiSession();
    const userAuth = createUserDriveClient(googleApiSession);
    if (userAuth) {
      try {
        const userTitle = await getDriveDocumentTitle(fileId, userAuth);
        if (userTitle) return NextResponse.json({ title: userTitle });
      } catch (error) {
        console.warn("google_document_title_user_auth_failed", error);
      }
    }

    const serviceAccountAuth = createGoogleServiceAccountAuth();
    const title = await getDriveDocumentTitle(fileId, serviceAccountAuth);

    return NextResponse.json({ title });
  } catch (error) {
    if (error instanceof GoogleServiceAccountConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error("google_document_title_error", error);
    return NextResponse.json({ error: "Unable to resolve Google document title." }, { status: 400 });
  }
}
