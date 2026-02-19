# Local Google OAuth Setup

This project uses Google OAuth for sign-in and maps users to internal roles:

- `ADMINISTRATOR`
- `EXECUTIVE`
- `USER`

The very first signed-in user is automatically created as `ADMINISTRATOR`.

## 1. Create a Google Cloud project

1. Open Google Cloud Console.
2. Create a project (or select an existing one).

## 2. Configure OAuth consent screen

1. Go to **APIs & Services -> OAuth consent screen**.
2. Choose **External** for local testing.
3. Fill in app name and support email.
4. Add your own Google account under **Test users**.

## 3. Create OAuth client credentials

1. Go to **APIs & Services -> Credentials**.
2. Click **Create Credentials -> OAuth client ID**.
3. Choose **Web application**.
4. Configure:
   - Authorized JavaScript origins:
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback`
5. Save and copy:
   - Client ID
   - Client secret

## 4. Set local environment variables

Add these to `.env`:

```bash
AUTH_SECRET="<generate-a-random-secret>"
GOOGLE_CLIENT_ID="<from-google-console>"
GOOGLE_CLIENT_SECRET="<from-google-console>"
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

## 5. Apply database schema updates

```bash
npm run db:sync
```

## 6. Run the app

```bash
npm run dev
```

Then open `http://localhost:3000/sign-in` and click **Continue with Google**.

## 7. Manage roles in-app

1. Sign in as the first user (becomes `ADMINISTRATOR`).
2. Open **Administration** in the top navigation.
3. Update user roles as needed.
