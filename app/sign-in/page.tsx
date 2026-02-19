import { sanitizeNextPath } from "@/lib/auth/server";

const errorMessages: Record<string, string> = {
  google_config: "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.",
  google_missing_code: "Google did not return an authorization code.",
  google_state_mismatch: "Sign-in session expired. Try again.",
  google_token_exchange_failed: "Google token exchange failed. Check redirect URI and client secret.",
  google_token_fetch_failed: "Could not reach Google token endpoint.",
  google_profile_fetch_failed: "Could not read your Google profile.",
  google_email_not_verified: "Your Google account email must be verified.",
  account_inactive: "Your account is inactive. Ask an administrator to re-enable access."
};

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const loginHref = `/api/auth/google/login?next=${encodeURIComponent(nextPath)}`;
  const errorText = params.error ? errorMessages[params.error] || `Sign-in failed: ${params.error}` : null;

  return (
    <main>
      <section className="auth-page">
        <div className="panel auth-card">
          <h1>Sign in to Abundant CRM</h1>
          <p className="muted">Use your Google account to continue.</p>
          {errorText ? <p className="status error">{errorText}</p> : null}
          <div className="actions">
            <a className="auth-google-button" href={loginHref}>
              Continue with Google
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
