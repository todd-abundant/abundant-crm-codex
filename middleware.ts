import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { verifyAuthToken } from "@/lib/auth/token";

function isPublicRoute(pathname: string) {
  return pathname === "/sign-in" || pathname.startsWith("/api/auth/");
}

function isAdminRoute(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/icon.svg";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const authSecret = process.env.AUTH_SECRET || "";
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token && authSecret ? await verifyAuthToken(token, authSecret) : null;
  const isAuthed = Boolean(session);

  if (!isAuthed && !isPublicRoute(pathname)) {
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthed && pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isAdminRoute(pathname) && session?.role !== "ADMINISTRATOR") {
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
