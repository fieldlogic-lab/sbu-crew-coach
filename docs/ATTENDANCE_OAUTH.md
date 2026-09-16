# Attendance Google OAuth setup

The Coach app reads the private student-maintained attendance Sheet using Tim's existing Google access. The Sheet remains the source of truth and does not need to be re-shared or made public.

## Runtime configuration

Set these Vercel environment variables for Production (and Preview if testing there):

- `GOOGLE_OAUTH_CLIENT_ID` — OAuth 2.0 Web application client ID
- `GOOGLE_OAUTH_CLIENT_SECRET` — OAuth 2.0 Web application client secret
- `GOOGLE_OAUTH_STATE_SECRET` — long random secret used to sign the OAuth state parameter
- `ATTENDANCE_SPREADSHEET_ID` — private ID of the `26-27 Attendance` Google Sheet
- `ATTENDANCE_SHEET_NAME` — `Fall 26`
- `CRON_SECRET` — long random secret used by Vercel Cron authentication

Do not commit any of these values to GitHub.

## Google Cloud setup

1. Create or select a Google Cloud project for the Coach app.
2. Enable the Google Sheets API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID of type **Web application**.
5. Add the production callback URL as an authorized redirect URI:
   `https://crew.rtpny.com/api/google-auth-callback`
6. Put the client ID and client secret into Vercel environment variables.

The app requests only `https://www.googleapis.com/auth/spreadsheets.readonly`.

## One-time connection

After the environment variables are deployed, open:

`https://crew.rtpny.com/api/google-auth-start`

Sign in as the Google account that already has access to the attendance Sheet and approve read-only Sheets access. The callback stores only the refresh token in private Vercel Blob storage and immediately performs the first attendance refresh.

## Nightly refresh

Vercel Cron calls `/api/attendance-refresh` daily at `07:00 UTC`, which is approximately 2–3 AM Eastern depending on daylight-saving time.

The refresh reads `26-27 Attendance` / `Fall 26`, normalizes the roster and dated attendance columns, and updates the existing protected Coach attendance cache. A failed refresh leaves the previous valid attendance data intact.
