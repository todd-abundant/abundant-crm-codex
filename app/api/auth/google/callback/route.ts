import { NextResponse } from "next/server";
import {
  clearOAuthCookies,
  createSessionTokenForUser,
  readGoogleApiSession,
  readOAuthNextCookie,
  readOAuthStateCookie,
  resolveGoogleRedirectUri,
  resolvePublicOrigin,
  setAuthCookie,
  setGoogleApiSession,
  upsertGoogleUser
} from "@/lib/auth/server";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

function redirectToSignIn(request: Request, error: string) {
  const signInUrl = new URL(`/sign-in?error=${encodeURIComponent(error)}`, resolvePublicOrigin(request));
  return NextResponse.redirect(signInUrl);
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (!clientId || !clientSecret || !authSecret) {
    return redirectToSignIn(request, "google_config");
  }

  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    return redirectToSignIn(request, `google_${providerError}`);
  }

  if (!state || !code) {
    return redirectToSignIn(request, "google_missing_code");
  }

  const expectedState = await readOAuthStateCookie();
  if (!expectedState || expectedState !== state) {
    return redirectToSignIn(request, "google_state_mismatch");
  }

  let tokenPayload: GoogleTokenResponse;
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: resolveGoogleRedirectUri(request),
        grant_type: "authorization_code"
      })
    });

    tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      console.error("google_oauth_token_error", tokenPayload);
      return redirectToSignIn(request, "google_token_exchange_failed");
    }
  } catch (error) {
    console.error("google_oauth_token_fetch_error", error);
    return redirectToSignIn(request, "google_token_fetch_failed");
  }

  let profile: GoogleUserInfo;
  try {
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`
      }
    });

    profile = (await profileResponse.json()) as GoogleUserInfo;
    if (!profileResponse.ok) {
      console.error("google_oauth_profile_error", profile);
      return redirectToSignIn(request, "google_profile_fetch_failed");
    }
  } catch (error) {
    console.error("google_oauth_profile_fetch_error", error);
    return redirectToSignIn(request, "google_profile_fetch_failed");
  }

  if (!profile.email || !profile.email_verified || !profile.sub) {
    return redirectToSignIn(request, "google_email_not_verified");
  }

  const user = await upsertGoogleUser(profile);
  if (!user) {
    return redirectToSignIn(request, "account_inactive");
  }

  const nextPath = await readOAuthNextCookie();
  const sessionToken = await createSessionTokenForUser(user);
  const response = NextResponse.redirect(new URL(nextPath, resolvePublicOrigin(request)));
  const existingGoogleApiSession = await readGoogleApiSession();
  const refreshToken =
    tokenPayload.refresh_token ||
    (existingGoogleApiSession && existingGoogleApiSession.userId === user.id
      ? existingGoogleApiSession.refreshToken
      : null);
  const accessTokenExpiresAt =
    typeof tokenPayload.expires_in === "number" && Number.isFinite(tokenPayload.expires_in)
      ? Date.now() + Math.max(0, tokenPayload.expires_in) * 1000
      : null;

  setAuthCookie(response, sessionToken);
  await setGoogleApiSession(response, {
    userId: user.id,
    email: user.email,
    accessToken: tokenPayload.access_token,
    refreshToken,
    tokenType: tokenPayload.token_type || null,
    scope: tokenPayload.scope || null,
    accessTokenExpiresAt
  });
  clearOAuthCookies(response);
  return response;
}
