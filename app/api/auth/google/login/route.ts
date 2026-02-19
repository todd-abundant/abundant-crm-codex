import { NextResponse } from "next/server";
import { GOOGLE_SCOPES } from "@/lib/auth/constants";
import {
  resolveGoogleRedirectUri,
  resolvePublicOrigin,
  sanitizeNextPath,
  setOAuthNextCookie,
  setOAuthStateCookie
} from "@/lib/auth/server";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    const failUrl = new URL("/sign-in?error=google_config", resolvePublicOrigin(request));
    return NextResponse.redirect(failUrl);
  }

  const requestUrl = new URL(request.url);
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const state = crypto.randomUUID();

  const googleAuthorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthorizeUrl.searchParams.set("client_id", clientId);
  googleAuthorizeUrl.searchParams.set("redirect_uri", resolveGoogleRedirectUri(request));
  googleAuthorizeUrl.searchParams.set("response_type", "code");
  googleAuthorizeUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  googleAuthorizeUrl.searchParams.set("state", state);
  googleAuthorizeUrl.searchParams.set("prompt", "select_account");
  googleAuthorizeUrl.searchParams.set("access_type", "offline");

  const response = NextResponse.redirect(googleAuthorizeUrl);
  setOAuthStateCookie(response, state);
  setOAuthNextCookie(response, nextPath);

  return response;
}
