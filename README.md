# Jira Time Calendar

A personal weekly calendar (like Google Calendar) for planning work and logging
time against your assigned Jira tickets. Drag tickets from the sidebar onto
the calendar, move/resize entries, and time is synced to Jira as worklogs —
with a local SQLite copy kept as a backup/report.

## Stack

- Next.js (App Router) + React + TypeScript
- Prisma + SQLite (swappable for Postgres/Supabase later — just change the
  Prisma datasource and run a migration)
- NextAuth v5 — Google login for the app
- Jira Cloud REST API (API token auth) for tickets + worklogs
- `react-big-calendar` with the drag-and-drop addon for the weekly view

## Setup

1. Copy the example env file and fill in secrets:
   ```bash
   cp .env.local.example .env.local
   ```
   - `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`: generate with `openssl rand -base64 32`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: create an OAuth 2.0 Client ID in the
     [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
     with authorized redirect URI `http://localhost:3000/api/auth/callback/google`

2. Install dependencies and set up the database (already done once, re-run if
   you pull schema changes):
   ```bash
   npm install --legacy-peer-deps
   npx prisma migrate dev
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

4. Sign in with Google, then go to **Settings** and connect Jira:
   - Your Jira Cloud site URL (e.g. `https://yourcompany.atlassian.net`)
   - Your Atlassian account email
   - An API token from https://id.atlassian.com/manage-profile/security/api-tokens

5. Back on the calendar, click **Sync** to pull your assigned, non-closed
   tickets, then drag one onto the calendar to create a time entry — it's
   saved locally and pushed to Jira as a worklog immediately. Move/resize an
   entry to update both.

## Notes

- `npm install` requires `--legacy-peer-deps` due to an unrelated npm/arborist
  peer-resolution bug with some transitive deps.
- The Jira API token is encrypted (AES-256-GCM) before being stored in SQLite.
- Middleware (`src/proxy.ts`) protects all routes except `/login` and the auth
  API, using an Edge-safe NextAuth config (no Prisma in Edge runtime).
