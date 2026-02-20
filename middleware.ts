import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdmin, canAccessWorkbenches, normalizeRoles } from "@/lib/auth/permissions";
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { createAuthToken, verifyAuthToken } from "@/lib/auth/token";

function isPublicRoute(pathname: string) {
  return pathname === "/sign-in" || pathname.startsWith("/api/auth/");
}

function isAdminRoute(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

function isWorkbenchPage(pathname: string) {
  return (
    pathname === "/health-systems" ||
    pathname.startsWith("/co-investors") ||
    pathname.startsWith("/companies") ||
    pathname.startsWith("/narrative-agent") ||
    pathname.startsWith("/workbench")
  );
}

function isWorkbenchApi(pathname: string) {
  return (
    pathname.startsWith("/api/health-systems") ||
    pathname.startsWith("/api/co-investors") ||
    pathname.startsWith("/api/companies") ||
    pathname.startsWith("/api/narrative-agent") ||
    pathname.startsWith("/api/workbench") ||
    pathname.startsWith("/api/debug")
  );
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/icon.svg";
}

function isLocalDebugBypass(request: NextRequest, pathname: string) {
  if (pathname !== "/api/debug/health-system-search") return false;
  if (process.env.NODE_ENV === "production") return false;

  const host = request.nextUrl.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }
  if (isLocalDebugBypass(request, pathname)) {
    return NextResponse.next();
  }
  if (pathname === "/api/auth/session") {
    return NextResponse.next();
  }

  const authSecret = process.env.AUTH_SECRET || "";
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token && authSecret ? await verifyAuthToken(token, authSecret) : null;
  let roles = normalizeRoles(session?.roles);
  const isAuthed = Boolean(session);
  let refreshedToken: string | null = null;

  if (isAuthed) {
    try {
      const sessionUrl = new URL("/api/auth/session", request.url);
      const sessionResponse = await fetch(sessionUrl, {
        method: "GET",
        headers: {
          cookie: request.headers.get("cookie") || ""
        },
        cache: "no-store"
      });

      if (sessionResponse.ok) {
        const payload = (await sessionResponse.json()) as { user?: { roles?: string[] } | null };
        const dbRoles = normalizeRoles(payload.user?.roles);
        if (dbRoles.length > 0) {
          roles = dbRoles;
          const tokenRoles = normalizeRoles(session?.roles);
          const rolesChanged =
            dbRoles.length !== tokenRoles.length || dbRoles.some((role) => !tokenRoles.includes(role));

          if (rolesChanged && session) {
            const now = Math.floor(Date.now() / 1000);
            refreshedToken = await createAuthToken(
              {
                sub: session.sub,
                email: session.email,
                roles: dbRoles,
                iat: now,
                exp: now + AUTH_COOKIE_MAX_AGE_SECONDS,
                name: session.name || null,
                image: session.image || null
              },
              authSecret
            );
          }
        }
      }
    } catch (error) {
      console.error("middleware_role_refresh_error", error);
    }
  }

  function withSessionRefresh(response: NextResponse) {
    if (!refreshedToken) return response;
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: refreshedToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
    });
    return response;
  }

  if (!isAuthed && !isPublicRoute(pathname)) {
    if (isApiRoute(pathname)) {
      return withSessionRefresh(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return withSessionRefresh(NextResponse.redirect(signInUrl));
  }

  if (isAuthed && pathname === "/sign-in") {
    return withSessionRefresh(NextResponse.redirect(new URL("/", request.url)));
  }

  if (isAdminRoute(pathname) && !canAccessAdmin(roles)) {
    if (isApiRoute(pathname)) {
      return withSessionRefresh(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    return withSessionRefresh(NextResponse.redirect(new URL("/", request.url)));
  }

  if ((isWorkbenchPage(pathname) || isWorkbenchApi(pathname)) && !canAccessWorkbenches(roles)) {
    if (isApiRoute(pathname)) {
      return withSessionRefresh(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    return withSessionRefresh(NextResponse.redirect(new URL("/", request.url)));
  }

  return withSessionRefresh(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
