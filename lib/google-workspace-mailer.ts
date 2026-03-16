import { google } from "googleapis";

type GoogleServiceAccountConfig = {
  client_email: string;
  private_key: string;
};

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export class GoogleWorkspaceMailerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleWorkspaceMailerConfigError";
  }
}

function parseServiceAccount(raw?: string) {
  if (!raw) {
    throw new GoogleWorkspaceMailerConfigError(
      "Missing GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON (or GOOGLE_DOCS_SERVICE_ACCOUNT_JSON fallback) for Gmail sending."
    );
  }

  try {
    const parsed = JSON.parse(raw) as GoogleServiceAccountConfig;
    if (!parsed || typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      throw new Error("Invalid Google service-account payload.");
    }

    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n")
    };
  } catch {
    throw new GoogleWorkspaceMailerConfigError(
      "GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON must be valid JSON containing client_email and private_key."
    );
  }
}

function resolveMailerConfig() {
  const senderEmail = process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL?.trim();
  if (!senderEmail) {
    throw new GoogleWorkspaceMailerConfigError(
      "GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL is missing. Set it to the mailbox that should send the weekly digest."
    );
  }

  const credentials = parseServiceAccount(
    process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON?.trim()
  );

  return {
    senderEmail,
    fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME?.trim() || "Abundant CRM",
    credentials
  };
}

function encodeHeader(text: string) {
  return text.replace(/[\r\n]+/g, " ").trim();
}

function recipientHeader(email: string, name?: string | null) {
  const cleanEmail = encodeHeader(email);
  if (!name) return cleanEmail;
  return `${encodeHeader(name)} <${cleanEmail}>`;
}

export async function sendGoogleWorkspaceEmail(input: {
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
}) {
  const config = resolveMailerConfig();
  const auth = new google.auth.JWT({
    email: config.credentials.clientEmail,
    key: config.credentials.privateKey,
    scopes: [GMAIL_SEND_SCOPE],
    subject: config.senderEmail
  });

  const gmail = google.gmail({ version: "v1", auth });
  const boundary = `abundant-crm-${Date.now().toString(36)}`;
  const rawMessage = [
    `From: ${recipientHeader(config.senderEmail, config.fromName)}`,
    `To: ${recipientHeader(input.toEmail, input.toName)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    input.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    input.html,
    "",
    `--${boundary}--`
  ].join("\r\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: Buffer.from(rawMessage).toString("base64url")
    }
  });
}

export function isGoogleWorkspaceMailerConfigured() {
  return Boolean(
    process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL?.trim() &&
      (process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON?.trim())
  );
}
