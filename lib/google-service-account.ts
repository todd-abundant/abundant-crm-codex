import { google } from "googleapis";

type GoogleServiceAccountConfig = {
  client_email: string;
  private_key: string;
};

const GOOGLE_SERVICE_ACCOUNT_DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/presentations"
];

export class GoogleServiceAccountConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleServiceAccountConfigError";
  }
}

function parseGoogleServiceAccount(raw?: string) {
  if (!raw) {
    throw new GoogleServiceAccountConfigError(
      "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is missing. Add a valid service-account JSON payload for Google Drive/Slides access."
    );
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Parsed service account payload is invalid.");
    }
    const credentials = parsed as GoogleServiceAccountConfig;
    if (typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") {
      throw new Error("Parsed service account payload is missing client_email/private_key.");
    }

    return {
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key.replace(/\\n/g, "\n")
    };
  } catch {
    throw new GoogleServiceAccountConfigError(
      "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON must be valid JSON containing client_email and private_key."
    );
  }
}

export type GoogleServiceAccountAuth = InstanceType<typeof google.auth.JWT>;

export function createGoogleServiceAccountAuth(scopes: string[] = GOOGLE_SERVICE_ACCOUNT_DEFAULT_SCOPES) {
  const credentials = parseGoogleServiceAccount(process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON?.trim());
  return new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes
  });
}

export async function resolveGoogleServiceAccountAccessToken(auth: GoogleServiceAccountAuth) {
  const token = await auth.getAccessToken();
  if (typeof token === "string") return token || null;
  if (token && typeof token.token === "string") return token.token;
  return null;
}
