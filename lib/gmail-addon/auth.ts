import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { prisma } from "@/lib/db";
import { canAccessWorkbenches, normalizeRoles } from "@/lib/auth/permissions";
import { type GmailAddonEvent, type AddonActor } from "@/lib/gmail-addon/types";

const oauthClient = new OAuth2Client();

const TRUSTED_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export class AddonAuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = "addon_auth_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

function ensureTrustedIssuer(payload: TokenPayload, tokenType: "system" | "user") {
  const issuer = payload.iss || "";
  if (!TRUSTED_ISSUERS.has(issuer)) {
    throw new AddonAuthError(`Untrusted ${tokenType} token issuer`, 401, "addon_invalid_issuer");
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

async function verifyGoogleIdToken(idToken: string, audience: string, tokenType: "system" | "user") {
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new AddonAuthError(`Missing ${tokenType} token payload`, 401, "addon_missing_token_payload");
  }

  ensureTrustedIssuer(payload, tokenType);
  return payload;
}

function ensureAddonEnabled() {
  const configured = process.env.GMAIL_ADDON_ENABLED?.trim().toLowerCase();
  if (configured === "false") {
    throw new AddonAuthError("Gmail add-on integration is disabled", 503, "addon_disabled");
  }
}

export async function authenticateAddonRequest(request: Request, event: GmailAddonEvent): Promise<AddonActor> {
  ensureAddonEnabled();

  const devBypassEmail = normalizeEmail(process.env.GMAIL_ADDON_DEV_BYPASS_EMAIL) || null;
  if (devBypassEmail && process.env.NODE_ENV !== "production") {
    const devUser = await prisma.user.findUnique({
      where: { email: devBypassEmail },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        roles: {
          select: { role: true }
        }
      }
    });

    if (!devUser || !devUser.isActive) {
      throw new AddonAuthError("Dev bypass user not found or inactive", 403, "addon_dev_bypass_user_not_allowed");
    }

    const roles = normalizeRoles(devUser.roles.map((entry) => entry.role));
    if (!canAccessWorkbenches(roles)) {
      throw new AddonAuthError("Dev bypass user lacks workbench access", 403, "addon_dev_bypass_user_forbidden");
    }

    return {
      id: devUser.id,
      email: devUser.email,
      name: devUser.name,
      roles
    };
  }

  const endpointAudience = process.env.GMAIL_ADDON_ENDPOINT_AUDIENCE?.trim();
  if (!endpointAudience) {
    throw new AddonAuthError(
      "Missing GMAIL_ADDON_ENDPOINT_AUDIENCE configuration",
      500,
      "addon_missing_endpoint_audience"
    );
  }

  const oauthClientId = process.env.GMAIL_ADDON_OAUTH_CLIENT_ID?.trim();
  if (!oauthClientId) {
    throw new AddonAuthError(
      "Missing GMAIL_ADDON_OAUTH_CLIENT_ID configuration",
      500,
      "addon_missing_oauth_client_id"
    );
  }

  const expectedServiceAccountEmail = normalizeEmail(process.env.GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL) || null;

  const authHeaderToken = extractBearerToken(request.headers.get("authorization"));
  const systemIdToken = authHeaderToken || event.authorizationEventObject?.systemIdToken || null;
  if (!systemIdToken) {
    throw new AddonAuthError("Missing Google system token", 401, "addon_missing_system_token");
  }

  let systemPayload: TokenPayload;
  try {
    systemPayload = await verifyGoogleIdToken(systemIdToken, endpointAudience, "system");
  } catch (error) {
    if (error instanceof AddonAuthError) {
      throw error;
    }
    console.error("gmail_addon_system_token_verify_error", error);
    throw new AddonAuthError("Invalid Google system token", 401, "addon_invalid_system_token");
  }

  if (expectedServiceAccountEmail) {
    const tokenEmail = normalizeEmail(systemPayload.email);
    if (!tokenEmail || tokenEmail !== expectedServiceAccountEmail) {
      throw new AddonAuthError("System token service account mismatch", 401, "addon_system_identity_mismatch");
    }
  }

  const userIdToken = event.authorizationEventObject?.userIdToken || null;
  if (!userIdToken) {
    throw new AddonAuthError("Missing Google user identity token", 401, "addon_missing_user_token");
  }

  let userPayload: TokenPayload;
  try {
    userPayload = await verifyGoogleIdToken(userIdToken, oauthClientId, "user");
  } catch (error) {
    if (error instanceof AddonAuthError) {
      throw error;
    }
    console.error("gmail_addon_user_token_verify_error", error);
    throw new AddonAuthError("Invalid Google user token", 401, "addon_invalid_user_token");
  }

  const userEmail = normalizeEmail(userPayload.email);
  if (!userEmail) {
    throw new AddonAuthError("User token is missing email", 401, "addon_missing_user_email");
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      roles: {
        select: { role: true }
      }
    }
  });

  if (!user || !user.isActive) {
    throw new AddonAuthError("CRM account not found or inactive", 403, "addon_user_not_allowed");
  }

  const roles = normalizeRoles(user.roles.map((entry) => entry.role));
  if (!canAccessWorkbenches(roles)) {
    throw new AddonAuthError("CRM role does not allow add-on access", 403, "addon_user_forbidden");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles
  };
}
