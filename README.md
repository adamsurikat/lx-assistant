# Jira Time Calendar

A personal weekly calendar (like Google Calendar) for planning work and logging
time against your assigned Jira tickets. Drag tickets from the sidebar onto
the calendar, move/resize entries, and time is synced to Jira as worklogs —
with a local SQLite copy kept as a backup/report.

## Stack

- Next.js (App Router) + React + TypeScript
- Prisma + SQLite (swappable for Postgres/Supabase later — just change the
  Prisma datasource and run a migration)
- NextAuth v5 — Google login for the app, also used to read your Google Calendar
- Jira Cloud REST API (API token auth by default, or optional Atlassian
  OAuth 2.0 3LO) for tickets + worklogs
- `react-big-calendar` with the drag-and-drop addon for the weekly view (Mon–Fri only)

## Setup

1. Copy the example env file and fill in secrets:
   ```bash
   cp .env.local.example .env.local
   ```
   - `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`: generate with `openssl rand -base64 32`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: create an OAuth 2.0 Client ID in the
     [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
     with authorized redirect URI `http://localhost:3456/api/auth/callback/google`.
     The app requests the read-only Google Calendar scope in addition to basic
     profile/email, so also enable the **Google Calendar API** for your project
     under APIs & Services, and add `.../auth/calendar.readonly` as a scope on
     the OAuth consent screen if using External/testing mode.
   - `JIRA_OAUTH_CLIENT_ID` / `JIRA_OAUTH_CLIENT_SECRET` (optional): only
     needed if you want to offer the OAuth connection method in Settings
     instead of a manual API token. Register an OAuth 2.0 (3LO) app at
     https://developer.atlassian.com/console/myapps/ with callback URL
     `http://localhost:3456/api/jira/callback` and permissions
     `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`.

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

4. Sign in with Google (accept the Calendar read-only permission prompt — this
   is needed to show your meetings on the calendar), then go to **Settings**
   and connect Jira:
   - Your Jira Cloud site URL (e.g. `https://yourcompany.atlassian.net`)
   - Your Atlassian account email
   - An API token from https://id.atlassian.com/manage-profile/security/api-tokens

   If you configured `JIRA_OAUTH_CLIENT_ID`/`SECRET`, a toggle appears to
   "Use Atlassian OAuth instead of an API token" — check it and click
   **Connect Jira** to use OAuth instead (no token to copy/paste; revoke
   access anytime from your Atlassian account settings).

5. Back on the calendar, click **Sync** to pull your assigned, non-closed
   tickets, then drag one onto the calendar to create a time entry — it's
   saved locally and pushed to Jira as a worklog immediately. Move/resize an
   entry to update both.

## Bootstrapping map data

The `/map` page's ports, depots, and sea routes live in the database
(`MapPort`/`MapDepot`/`MapRoute`), not in code, so a brand-new database
starts with an empty map. To seed it with real data instead:

1. From an existing instance that already has map data, download a GeoJSON
   export while signed in:
   ```bash
   curl -H "Cookie: <your session cookie>" http://localhost:3456/api/map/export -o mapData.geojson
   ```
   or just open `/api/map/export` in the browser (while logged in) — it
   downloads a `.geojson` file. This repo's own map data is committed at
   `prisma/mapData.geojson` and kept up to date the same way.
2. On the new deployment, import it with the bootstrap script (safe to
   re-run — matches existing rows by code/name and skips duplicates):
   ```bash
   npx tsx prisma/importMapGeoJSON.ts            # imports prisma/mapData.geojson
   npx tsx prisma/importMapGeoJSON.ts path/to.geojson  # or a specific file
   ```
   Alternatively, `POST` the file's contents as JSON to `/api/map/import`
   (while signed in) to import over the API instead of the CLI.

The GeoJSON is a plain `FeatureCollection`: ports/depots are `Point`
features (`properties.kind` is `"port"` or `"depot"`, plus `name`, `code`,
`tenant`, `country`, `description`), and routes are `LineString` features
(`properties.kind: "route"`) whose `startPort`/`endPort` reference a
port's `code` (or `name`, if it has no code) and whose `control1`/
`control2` are the two bezier control points that bow the curve — so it's
also editable/authorable by hand or from another data source, not just
round-tripped through the export endpoint.

## Notes

- `npm install` requires `--legacy-peer-deps` due to an unrelated npm/arborist
  peer-resolution bug with some transitive deps.
- Jira credentials (API token, or OAuth access/refresh tokens if using that
  method) are encrypted (AES-256-GCM) before being stored in SQLite, and are
  only ever used server-side.
- Middleware (`src/proxy.ts`) protects all routes except `/login` and the auth
  API, using an Edge-safe NextAuth config (no Prisma in Edge runtime).
