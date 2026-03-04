import { google } from "googleapis";

type IntakeSlidesSharingMode = "writer" | "reader" | "link";
type IntakeSlidesTemplateValues = Record<string, string>;
type GoogleAuthConfig = {
  client_email: string;
  private_key: string;
};

export type IntakeSlidesAuthInput =
  | { mode: "service_account" }
  | {
      mode: "user_oauth";
      accessToken: string;
      refreshToken?: string | null;
      accessTokenExpiresAt?: number | null;
      clientId: string;
      clientSecret: string;
    };

export type IntakeSlidesOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
};

const DRIVE_QUOTA_HINT = `Google Drive storage quota has been exceeded.

If this is your first production run, set GOOGLE_INTAKE_SLIDES_FOLDER_ID to a Shared Drive folder (service account must be a member with Content manager) so generated copies use shared storage.

If this happens on existing setup, delete older intake report files from the drive location and retry.`;

const DRIVE_QUOTA_HINT_USER_OAUTH = `Google Drive storage quota has been exceeded.

Set GOOGLE_INTAKE_SLIDES_FOLDER_ID to a Shared Drive folder your account can write to, or delete older generated report files in My Drive before retrying.`;

const DRIVE_STORAGE_SCOPE_HINT = `The configured output folder is not a Shared Drive.
If your Google environment does not expose Shared Drives, this runs in My Drive mode.
My Drive storage limits apply, so keep a cleanup cadence for older generated Intake Reports.`;

const GOOGLE_REAUTH_HINT =
  "Google Drive authorization for this account is missing or expired. Sign out and sign back in, then retry report generation.";
const ASSESSMENT_DOT_SYMBOLS = new Set(["🟢", "🟡", "🔴", "⚪", "●"]);
const ASSESSMENT_DOT_FONT_SIZE_PT = 30;
type InlineStyleKind = "bold" | "italic" | "superscript";
type InlineStyleRange = { start: number; end: number; kind: InlineStyleKind };

export class IntakeSlidesGenerationError extends Error {
  constructor(
    public code:
      | "template_id_missing"
      | "credentials_missing"
      | "credentials_invalid"
      | "copy_failed"
      | "replace_failed"
      | "share_failed",
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "IntakeSlidesGenerationError";
  }
}

const googleSlidesTemplateScopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/presentations"
];

export type IntakeDriveFolderMode = "shared_drive" | "my_drive" | "unknown";

function parseDriveFileIdFromUrl(url: string) {
  if (!url) return null;
  const directMatch = /\/presentation\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  if (directMatch && directMatch[1]) return directMatch[1];
  const queryMatch = /[?&]id=([^&]+)/.exec(url);
  if (queryMatch && queryMatch[1]) return decodeURIComponent(queryMatch[1]);
  return null;
}

export function extractDriveFileIdFromUrl(url: string) {
  return parseDriveFileIdFromUrl(url);
}

function parseSharingMode(value?: string): IntakeSlidesSharingMode {
  const mode = value?.trim().toLowerCase();
  if (mode === "reader" || mode === "link") return mode;
  return "writer";
}

function parseServiceAccount(raw?: string) {
  if (!raw) {
    throw new IntakeSlidesGenerationError(
      "credentials_missing",
      "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is missing. Add a valid service-account JSON payload for report generation.",
      500
    );
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Parsed service account payload is invalid.");
    }
    const credentials = parsed as GoogleAuthConfig;
    if (typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") {
      throw new Error("Parsed service account payload is missing client_email/private_key.");
    }
    return {
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key.replace(/\\n/g, "\n")
    };
  } catch {
    throw new IntakeSlidesGenerationError(
      "credentials_invalid",
      "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON must be valid JSON containing client_email and private_key.",
      500
    );
  }
}

type DriveClient = ReturnType<typeof google.drive>;
type SlidesClient = ReturnType<typeof google.slides>;

type GoogleClients = {
  drive: DriveClient;
  slides: SlidesClient;
  authMode: "service_account" | "user_oauth";
  readOAuthTokens: () => IntakeSlidesOAuthTokens | null;
};

function createServiceAccountClients(): GoogleClients {
  const credentials = parseServiceAccount(process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON?.trim());
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: googleSlidesTemplateScopes
  });

  return {
    drive: google.drive({ version: "v3", auth }),
    slides: google.slides({ version: "v1", auth }),
    authMode: "service_account",
    readOAuthTokens: () => null
  };
}

function createUserOAuthClients(input: Extract<IntakeSlidesAuthInput, { mode: "user_oauth" }>): GoogleClients {
  const oauth = new google.auth.OAuth2(input.clientId, input.clientSecret);
  oauth.setCredentials({
    access_token: input.accessToken,
    refresh_token: input.refreshToken || undefined,
    expiry_date:
      typeof input.accessTokenExpiresAt === "number" && Number.isFinite(input.accessTokenExpiresAt)
        ? input.accessTokenExpiresAt
        : undefined
  });

  let latestAccessToken = input.accessToken;
  let latestRefreshToken = input.refreshToken || null;
  let latestAccessTokenExpiresAt =
    typeof input.accessTokenExpiresAt === "number" && Number.isFinite(input.accessTokenExpiresAt)
      ? input.accessTokenExpiresAt
      : null;

  oauth.on("tokens", (tokens) => {
    if (tokens.access_token) latestAccessToken = tokens.access_token;
    if (typeof tokens.refresh_token === "string") latestRefreshToken = tokens.refresh_token;
    if (typeof tokens.expiry_date === "number" && Number.isFinite(tokens.expiry_date)) {
      latestAccessTokenExpiresAt = tokens.expiry_date;
    }
  });

  return {
    drive: google.drive({ version: "v3", auth: oauth }),
    slides: google.slides({ version: "v1", auth: oauth }),
    authMode: "user_oauth",
    readOAuthTokens: () => {
      const credentials = oauth.credentials || {};
      const accessToken =
        typeof credentials.access_token === "string" && credentials.access_token.length > 0
          ? credentials.access_token
          : latestAccessToken;
      if (!accessToken) return null;

      const refreshToken =
        typeof credentials.refresh_token === "string" && credentials.refresh_token.length > 0
          ? credentials.refresh_token
          : latestRefreshToken;
      const accessTokenExpiresAt =
        typeof credentials.expiry_date === "number" && Number.isFinite(credentials.expiry_date)
          ? credentials.expiry_date
          : latestAccessTokenExpiresAt;

      return {
        accessToken,
        refreshToken: refreshToken || null,
        accessTokenExpiresAt: accessTokenExpiresAt || null
      };
    }
  };
}

function createGoogleClients(authInput?: IntakeSlidesAuthInput): GoogleClients {
  if (authInput?.mode === "user_oauth") {
    return createUserOAuthClients(authInput);
  }
  return createServiceAccountClients();
}

async function resolveDriveFolderMode(drive: DriveClient, folderId: string) {
  const response = await drive.files.get({
    fileId: folderId,
    fields: "id,name,driveId",
    supportsAllDrives: true
  });

  const driveId = response.data.driveId;
  return {
    mode: (driveId ? "shared_drive" : "my_drive") as IntakeDriveFolderMode,
    folderName: response.data.name || null
  };
}

function parseInlineStyles(value: string): { plainText: string; ranges: InlineStyleRange[] } | null {
  if (!/(\*\*|\[\[(?:\/?B|\/?I|\/?SUP)\]\])/.test(value)) return null;

  let plainText = "";
  const ranges: InlineStyleRange[] = [];
  const openStarts: Record<InlineStyleKind, number[]> = {
    bold: [],
    italic: [],
    superscript: []
  };

  const open = (kind: InlineStyleKind) => {
    openStarts[kind].push(plainText.length);
  };
  const close = (kind: InlineStyleKind) => {
    const start = openStarts[kind].pop();
    if (typeof start !== "number") return;
    const end = plainText.length;
    if (end > start) ranges.push({ kind, start, end });
  };

  let index = 0;
  while (index < value.length) {
    if (value.startsWith("[[B]]", index)) {
      open("bold");
      index += 5;
      continue;
    }
    if (value.startsWith("[[/B]]", index)) {
      close("bold");
      index += 6;
      continue;
    }
    if (value.startsWith("[[I]]", index)) {
      open("italic");
      index += 5;
      continue;
    }
    if (value.startsWith("[[/I]]", index)) {
      close("italic");
      index += 6;
      continue;
    }
    if (value.startsWith("[[SUP]]", index)) {
      open("superscript");
      index += 7;
      continue;
    }
    if (value.startsWith("[[/SUP]]", index)) {
      close("superscript");
      index += 8;
      continue;
    }
    if (value.startsWith("**", index)) {
      if (openStarts.bold.length > 0) {
        close("bold");
      } else {
        open("bold");
      }
      index += 2;
      continue;
    }

    plainText += value[index];
    index += 1;
  }

  return {
    plainText,
    ranges
  };
}

function normalizeAssessmentDotContent(value: string) {
  return value.replace(/\uFE0F/g, "").trim();
}

function containsAssessmentDot(value: string) {
  const normalized = normalizeAssessmentDotContent(value);
  for (const symbol of ASSESSMENT_DOT_SYMBOLS) {
    if (normalized.includes(symbol)) return true;
  }
  return false;
}

async function buildBoldFormattingRequests(slides: SlidesClient, presentationId: string) {
  const presentation = await slides.presentations.get({
    presentationId,
    fields:
      "slides/pageElements(objectId,table/tableRows/tableCells/text/textElements(textRun/content),shape/text/textElements(textRun/content))"
  });

  const requests: Array<
    | {
        deleteText: {
          objectId: string;
          textRange: { type: "ALL" };
          cellLocation?: { rowIndex: number; columnIndex: number };
        };
      }
    | {
        insertText: {
          objectId: string;
          insertionIndex: number;
          text: string;
          cellLocation?: { rowIndex: number; columnIndex: number };
        };
      }
    | {
        updateTextStyle: {
          objectId: string;
          textRange: { type: "FIXED_RANGE"; startIndex: number; endIndex: number } | { type: "ALL" };
          style: {
            bold?: boolean;
            italic?: boolean;
            baselineOffset?: "NONE" | "SUPERSCRIPT";
          };
          fields: string;
          cellLocation?: { rowIndex: number; columnIndex: number };
        };
      }
  > = [];

  for (const slide of presentation.data.slides || []) {
    for (const element of slide.pageElements || []) {
      const objectId = element.objectId;
      if (!objectId) continue;

      const tableRows = element.table?.tableRows;
      if (tableRows && tableRows.length > 0) {
        for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex += 1) {
          const row = tableRows[rowIndex];
          const cells = row.tableCells || [];
          for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
            const cell = cells[columnIndex];
            if (!cell) continue;
            const original = (cell.text?.textElements || [])
              .map((entry) => entry.textRun?.content || "")
              .join("");
            const parsed = parseInlineStyles(original);
            if (!parsed) continue;

            requests.push({
              deleteText: {
                objectId,
                cellLocation: { rowIndex, columnIndex },
                textRange: { type: "ALL" }
              }
            });
            if (parsed.plainText.length > 0) {
              requests.push({
                insertText: {
                  objectId,
                  cellLocation: { rowIndex, columnIndex },
                  insertionIndex: 0,
                  text: parsed.plainText
                }
              });
            }
            requests.push({
              updateTextStyle: {
                objectId,
                cellLocation: { rowIndex, columnIndex },
                textRange: { type: "ALL" },
                style: { bold: false, italic: false, baselineOffset: "NONE" },
                fields: "bold,italic,baselineOffset"
              }
            });

            for (const range of parsed.ranges) {
              const styleUpdate =
                range.kind === "bold"
                  ? { style: { bold: true as const }, fields: "bold" as const }
                  : range.kind === "italic"
                    ? { style: { italic: true as const }, fields: "italic" as const }
                    : { style: { baselineOffset: "SUPERSCRIPT" as const }, fields: "baselineOffset" as const };
              requests.push({
                updateTextStyle: {
                  objectId,
                  cellLocation: { rowIndex, columnIndex },
                  textRange: {
                    type: "FIXED_RANGE",
                    startIndex: range.start,
                    endIndex: range.end
                  },
                  style: styleUpdate.style,
                  fields: styleUpdate.fields
                }
              });
            }

          }
        }
      }

      const shapeText = (element.shape?.text?.textElements || [])
        .map((entry) => entry.textRun?.content || "")
        .join("");
      const parsedShape = parseInlineStyles(shapeText);
      if (!parsedShape) continue;

      requests.push({
        deleteText: {
          objectId,
          textRange: { type: "ALL" }
        }
      });
      if (parsedShape.plainText.length > 0) {
        requests.push({
          insertText: {
            objectId,
            insertionIndex: 0,
            text: parsedShape.plainText
          }
        });
      }
      requests.push({
        updateTextStyle: {
          objectId,
          textRange: { type: "ALL" },
          style: { bold: false, italic: false, baselineOffset: "NONE" },
          fields: "bold,italic,baselineOffset"
        }
      });

      for (const range of parsedShape.ranges) {
        const styleUpdate =
          range.kind === "bold"
            ? { style: { bold: true as const }, fields: "bold" as const }
            : range.kind === "italic"
              ? { style: { italic: true as const }, fields: "italic" as const }
              : { style: { baselineOffset: "SUPERSCRIPT" as const }, fields: "baselineOffset" as const };
        requests.push({
          updateTextStyle: {
            objectId,
            textRange: {
              type: "FIXED_RANGE",
              startIndex: range.start,
              endIndex: range.end
            },
            style: styleUpdate.style,
            fields: styleUpdate.fields
          }
        });
      }

    }
  }

  return requests;
}

async function buildAssessmentDotStyleRequests(slides: SlidesClient, presentationId: string) {
  const presentation = await slides.presentations.get({
    presentationId,
    fields:
      "slides/pageElements(objectId,table/tableRows/tableCells/text/textElements(startIndex,textRun/content),shape/text/textElements(startIndex,textRun/content))"
  });

  const requests: Array<{
    updateTextStyle: {
      objectId: string;
      textRange: { type: "FIXED_RANGE"; startIndex: number; endIndex: number } | { type: "ALL" };
      cellLocation?: { rowIndex: number; columnIndex: number };
      style: { fontSize: { magnitude: number; unit: "PT" } };
      fields: string;
    };
  }> = [];

  for (const slide of presentation.data.slides || []) {
    for (const element of slide.pageElements || []) {
      const objectId = element.objectId;
      if (!objectId) continue;

      const tableRows = element.table?.tableRows;
      if (tableRows && tableRows.length > 1) {
        for (let rowIndex = 1; rowIndex < tableRows.length; rowIndex += 1) {
          const assessmentCell = tableRows[rowIndex]?.tableCells?.[2];
          if (!assessmentCell) continue;
          const cellContent = (assessmentCell.text?.textElements || [])
            .map((entry) => entry.textRun?.content || "")
            .join("");
          if (!containsAssessmentDot(cellContent)) continue;

          requests.push({
            updateTextStyle: {
              objectId,
              cellLocation: { rowIndex, columnIndex: 2 },
              textRange: { type: "ALL" },
              style: {
                fontSize: {
                  magnitude: ASSESSMENT_DOT_FONT_SIZE_PT,
                  unit: "PT"
                }
              },
              fields: "fontSize"
            }
          });
        }
      }

      const textElements = element.shape?.text?.textElements;
      if (!textElements) continue;

      for (const textElement of textElements) {
        const content = textElement.textRun?.content;
        const startIndex = textElement.startIndex;
        if (typeof content !== "string" || typeof startIndex !== "number") continue;

        const symbolMatch = content.match(/[🟢🟡🔴⚪●]/u);
        if (!symbolMatch || typeof symbolMatch.index !== "number") continue;

        const absoluteStartIndex = startIndex + symbolMatch.index;
        requests.push({
          updateTextStyle: {
            objectId,
            textRange: {
              type: "FIXED_RANGE",
              startIndex: absoluteStartIndex,
              endIndex: absoluteStartIndex + symbolMatch[0].length
            },
            style: {
              fontSize: {
                magnitude: ASSESSMENT_DOT_FONT_SIZE_PT,
                unit: "PT"
              }
            },
            fields: "fontSize"
          }
        });
      }
    }
  }

  return requests;
}

function isDriveStorageQuotaError(error: unknown) {
  const asAny = error as {
    message?: string;
    response?: { data?: { error?: { message?: string; errors?: { reason?: string }[] } } };
  };

  const message = asAny?.message;
  if (typeof message === "string" && message.toLowerCase().includes("storage quota")) return true;

  const errorMessage = asAny?.response?.data?.error?.message;
  if (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("storage quota")) return true;

  const reasons = asAny?.response?.data?.error?.errors;
  if (Array.isArray(reasons) && reasons.some((item) => item?.reason === "storageQuotaExceeded")) return true;

  return false;
}

function isSharedDrivePermissionError(error: unknown) {
  const asAny = error as {
    message?: string;
    response?: { data?: { error?: { message?: string; errors?: { reason?: string }[] } } };
  };

  const message = asAny?.message;
  if (typeof message === "string") {
    const lower = message.toLowerCase();
    if (lower.includes("not a member of this shared drive")) return true;
    if (lower.includes("permission") && lower.includes("shared drive")) return true;
  }

  const reasons = asAny?.response?.data?.error?.errors;
  if (Array.isArray(reasons) && reasons.some((item) => item?.reason === "notAMember")) return true;

  return false;
}

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

export async function createIntakeSlidesFromTemplate(input: {
  templateId: string;
  templateTitle: string;
  values: IntakeSlidesTemplateValues;
  userEmail: string;
  auth?: IntakeSlidesAuthInput;
}): Promise<{
  title: string;
  url: string;
  driveFolderMode: IntakeDriveFolderMode;
  storageHint: string | null;
  oauthTokens: IntakeSlidesOAuthTokens | null;
}> {
  const templateId = input.templateId?.trim();
  if (!templateId) {
    throw new IntakeSlidesGenerationError(
      "template_id_missing",
      "Configure GOOGLE_INTAKE_SLIDES_TEMPLATE_ID before generating Intake Reports.",
      400
    );
  }

  const sharingMode = parseSharingMode(process.env.GOOGLE_INTAKE_REPORT_SHARING);
  const folderId = process.env.GOOGLE_INTAKE_SLIDES_FOLDER_ID?.trim();
  const { drive, slides, authMode, readOAuthTokens } = createGoogleClients(input.auth);

  let copiedFileId: string;
  let copiedTitle: string;
  let copiedUrl: string;
  let driveFolderMode: IntakeDriveFolderMode = "my_drive";
  let storageHint: string | null =
    authMode === "service_account"
      ? `${DRIVE_STORAGE_SCOPE_HINT}\nConfigure GOOGLE_INTAKE_SLIDES_FOLDER_ID with a Shared Drive folder to enable team-drive capacity.`
      : null;

  if (folderId) {
    try {
      const folderMode = await resolveDriveFolderMode(drive, folderId);
      driveFolderMode = folderMode.mode;
      if (folderMode.mode === "my_drive") {
        storageHint = `${DRIVE_STORAGE_SCOPE_HINT}\nConfigured folder: ${folderMode.folderName || folderId}`;
      } else {
        storageHint = null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      if (authMode === "user_oauth" && isGoogleOauthReauthError(error)) {
        throw new IntakeSlidesGenerationError("copy_failed", GOOGLE_REAUTH_HINT, 401);
      }
      throw new IntakeSlidesGenerationError(
        "copy_failed",
        `Configured Google Drive folder validation failed for GOOGLE_INTAKE_SLIDES_FOLDER_ID.\nOriginal error: ${message}`,
        502
      );
    }
  }

  try {
    const copyBody: { name: string; parents?: string[] } = { name: input.templateTitle };
    if (folderId) {
      copyBody.parents = [folderId];
    }

    const copied = await drive.files.copy({
      fileId: templateId,
      requestBody: copyBody,
      fields: "id,webViewLink",
      supportsAllDrives: true
    });

    if (!copied.data.id) {
      throw new Error("Template copy returned no file id.");
    }

    copiedFileId = copied.data.id;
    copiedTitle = input.templateTitle;
    copiedUrl = copied.data.webViewLink || `https://docs.google.com/presentation/d/${copiedFileId}/edit`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    if (authMode === "user_oauth" && isGoogleOauthReauthError(error)) {
      throw new IntakeSlidesGenerationError("copy_failed", GOOGLE_REAUTH_HINT, 401);
    }

    if (isDriveStorageQuotaError(error)) {
      const quotaBaseHint = authMode === "user_oauth" ? DRIVE_QUOTA_HINT_USER_OAUTH : DRIVE_QUOTA_HINT;
      const quotaHint =
        driveFolderMode === "shared_drive"
          ? quotaBaseHint
          : `${quotaBaseHint}\n${DRIVE_STORAGE_SCOPE_HINT}`;
      throw new IntakeSlidesGenerationError(
        "copy_failed",
        `Google Slides template copy step failed: storage quota exceeded.\n${quotaHint}\n\nOriginal error: ${message}`,
        502
      );
    }

    if (isSharedDrivePermissionError(error)) {
      const hint = folderId
        ? authMode === "user_oauth"
          ? "Verify your Google account has at least Content manager access on the configured GOOGLE_INTAKE_SLIDES_FOLDER_ID shared drive folder."
          : "Verify the service account is a Content manager on the configured GOOGLE_INTAKE_SLIDES_FOLDER_ID shared drive folder."
        : authMode === "user_oauth"
          ? "Set GOOGLE_INTAKE_SLIDES_FOLDER_ID to a shared drive folder your account can access."
          : "Set GOOGLE_INTAKE_SLIDES_FOLDER_ID to a shared drive folder the service account can access.";
      throw new IntakeSlidesGenerationError(
        "copy_failed",
        `Google Slides template copy step failed: shared-drive permission denied.\n${hint}\n\nOriginal error: ${message}`,
        502
      );
    }

    throw new IntakeSlidesGenerationError(
      "copy_failed",
      `Google Slides template copy step failed: ${message}`,
      502
    );
  }

  try {
    const runBatchUpdate = async (step: string, stepRequests: object[]) => {
      if (stepRequests.length === 0) return;
      try {
        await slides.presentations.batchUpdate({
          presentationId: copiedFileId,
          requestBody: { requests: stepRequests }
        });
      } catch (error) {
        throw new Error(
          `${step} failed (${stepRequests.length} requests): ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    };

    const requests = Object.entries(input.values).map(([find, replaceWith]) => ({
      replaceAllText: {
        containsText: {
          text: find,
          matchCase: true
        },
        replaceText: replaceWith
      }
    }));

    await runBatchUpdate("Initial token replacement", requests);

    const boldFormattingRequests = await buildBoldFormattingRequests(slides, copiedFileId);
    if (boldFormattingRequests.length > 0) {
      await runBatchUpdate("Bold styling", boldFormattingRequests as object[]);
    }

    const assessmentDotStyleRequests = await buildAssessmentDotStyleRequests(slides, copiedFileId);
    await runBatchUpdate("Assessment dot styling", assessmentDotStyleRequests as object[]);
  } catch (error) {
    if (authMode === "user_oauth" && isGoogleOauthReauthError(error)) {
      throw new IntakeSlidesGenerationError("replace_failed", GOOGLE_REAUTH_HINT, 401);
    }
    throw new IntakeSlidesGenerationError(
      "replace_failed",
      `Google Slides token replacement step failed: ${error instanceof Error ? error.message : "unknown error"}`,
      502
    );
  }

  try {
    if (sharingMode === "link") {
      await drive.permissions.create({
        fileId: copiedFileId,
        requestBody: {
          type: "anyone",
          role: "writer"
        },
        supportsAllDrives: true,
        sendNotificationEmail: false
      });
    } else {
      await drive.permissions.create({
        fileId: copiedFileId,
        requestBody: {
          type: "user",
          role: sharingMode,
          emailAddress: input.userEmail
        },
        supportsAllDrives: true,
        sendNotificationEmail: false
      });
    }
  } catch (error) {
    if (authMode === "user_oauth" && isGoogleOauthReauthError(error)) {
      throw new IntakeSlidesGenerationError("share_failed", GOOGLE_REAUTH_HINT, 401);
    }
    throw new IntakeSlidesGenerationError(
      "share_failed",
      `Google Slides sharing step failed: ${error instanceof Error ? error.message : "unknown error"}`,
      502
    );
  }

  return {
    title: copiedTitle,
    url: copiedUrl,
    driveFolderMode,
    storageHint,
    oauthTokens: readOAuthTokens()
  };
}

export async function cleanupIntakeReportsOnDrive(
  documentUrls: string[],
  auth?: IntakeSlidesAuthInput
): Promise<{ deleted: number; skipped: number }> {
  const { drive, authMode } = createGoogleClients(auth);
  let deleted = 0;
  let skipped = 0;

  for (const url of documentUrls) {
    const fileId = extractDriveFileIdFromUrl(url);
    if (!fileId) {
      skipped += 1;
      continue;
    }

    try {
      await drive.files.delete({
        fileId,
        supportsAllDrives: true
      });
      deleted += 1;
    } catch (error) {
      if (authMode === "user_oauth" && isGoogleOauthReauthError(error)) {
        throw new IntakeSlidesGenerationError("copy_failed", GOOGLE_REAUTH_HINT, 401);
      }
      const status = (error as { code?: number })?.code;
      if (status === 404) {
        skipped += 1;
        continue;
      }
      skipped += 1;
    }
  }

  return { deleted, skipped };
}
