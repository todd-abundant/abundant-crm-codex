import { type UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessAdmin } from "@/lib/auth/permissions";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_NEXT_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME
} from "./constants";
import { createAuthToken, verifyAuthToken } from "./token";

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  roles: UserRole[];
  isActive: boolean;
};

type AdminApiCheck =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

type GoogleUserProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET in environment.");
  }
  return secret;
}

function shouldUseSecureCookies() {
  return process.env.NODE_ENV === "production";
}

export function resolvePublicOrigin(request: Request) {
  const configuredRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configuredRedirectUri) {
    try {
      return new URL(configuredRedirectUri).origin;
    } catch {
      // Fall back to forwarded headers or request URL.
    }
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function sanitizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function sanitizeNextPath(value: string | null | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.startsWith("/api/auth")) return "/";
  return value;
}

export function resolveGoogleRedirectUri(request: Request) {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI.trim();
  }

  return `${resolvePublicOrigin(request)}/api/auth/google/callback`;
}

export async function createSessionTokenForUser(user: {
  id: string;
  email: string;
  roles: UserRole[];
  name?: string | null;
  image?: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  return createAuthToken(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iat: now,
      exp: now + AUTH_COOKIE_MAX_AGE_SECONDS,
      name: user.name || null,
      image: user.image || null
    },
    authSecret()
  );
}

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
}

export function setOAuthStateCookie(response: NextResponse, state: string) {
  response.cookies.set({
    name: OAUTH_STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS
  });
}

export function setOAuthNextCookie(response: NextResponse, nextPath: string) {
  response.cookies.set({
    name: OAUTH_NEXT_COOKIE_NAME,
    value: nextPath,
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS
  });
}

export function clearOAuthCookies(response: NextResponse) {
  response.cookies.set({
    name: OAUTH_STATE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
  response.cookies.set({
    name: OAUTH_NEXT_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
}

export async function readOAuthStateCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value || null;
}

export async function readOAuthNextCookie() {
  const cookieStore = await cookies();
  return sanitizeNextPath(cookieStore.get(OAUTH_NEXT_COOKIE_NAME)?.value);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  let payload = null;
  try {
    payload = await verifyAuthToken(token, authSecret());
  } catch {
    return null;
  }
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        isActive: true,
        roles: {
          select: { role: true }
        }
      }
    });

    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isActive: user.isActive,
      roles: user.roles.map((item) => item.role)
    };
  } catch (error) {
    console.error("auth_load_current_user_error", error);
    return null;
  }
}

export async function requireAdminApi() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    } satisfies AdminApiCheck;
  }

  if (!canAccessAdmin(user.roles)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    } satisfies AdminApiCheck;
  }

  return { ok: true, user } satisfies AdminApiCheck;
}

export async function upsertGoogleUser(profile: GoogleUserProfile) {
  const email = sanitizeEmail(profile.email);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        isActive: true
      }
    });

    if (existing) {
      if (!existing.isActive) return null;
      return tx.user.update({
        where: { id: existing.id },
        data: {
          name: profile.name || null,
          image: profile.picture || null,
          googleSub: profile.sub,
          lastLoginAt: now
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          isActive: true,
          roles: {
            select: { role: true }
          }
        }
      });
    }

    const userCount = await tx.user.count();
    const seedRoles: UserRole[] = userCount === 0 ? ["ADMINISTRATOR", "USER"] : ["USER"];

      return tx.user.create({
        data: {
          email,
          name: profile.name || null,
        image: profile.picture || null,
        googleSub: profile.sub,
        isActive: true,
        lastLoginAt: now,
        roles: {
          createMany: {
            data: seedRoles.map((role) => ({ role }))
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        isActive: true,
        roles: {
          select: { role: true }
        }
      }
    });
  });

  if (!result) return null;

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    image: result.image,
    isActive: result.isActive,
    roles: result.roles.map((item) => item.role)
  };
}
