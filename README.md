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
   npm run map:import                      # imports prisma/mapData.geojson
   npm run map:import -- path/to.geojson   # or a specific file
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

## Running with Docker

The app also ships a `Dockerfile` + `docker-compose.yml` for a self-contained
deployment. By default it uses SQLite and automatically reuses whatever
database is already around, in priority order: (1) if the container has
already run before, it keeps using its own persistent volume as-is; (2)
otherwise, if you have a local `prisma/dev.db` (e.g. from `npm run dev`),
that's copied in as the starting point; (3) otherwise, it creates a brand
new empty database — no manual setup needed either way, and nothing is ever
created on the host filesystem. Postgres (e.g. Supabase) is supported as a
drop-in alternative on top of that (a couple of extra env vars, no file
changes needed). Either way, the schema is brought up to date automatically
every time the container starts (see `docker-entrypoint.sh`).

1. Fill in `.env.local` as in step 1 of Setup above (same env vars — the
   compose file loads it via `env_file`). Use `http://localhost:3456/...` for
   the Google/Jira OAuth redirect URIs if running locally, or your real
   domain if deploying behind a reverse proxy. Then add a database config —
   pick one:

   **SQLite (default):**
   ```bash
   DATABASE_URL="file:/app/data/dev.db"
   ```
   Nothing else to configure. The database lives on a Docker-managed named
   volume (`app_data`) that persists across restarts/rebuilds on its own —
   see the reuse priority above for what ends up in it the very first time.
   If you already have a `prisma/dev.db` locally, it's picked up
   automatically (via a read-only bind mount of `./prisma`, see
   `docker-compose.yml`); you don't need to copy or move anything yourself.
   Note the copy is one-way and only happens once, when the volume is still
   empty — the container's own writes after that never affect your local
   `prisma/dev.db`, so local (non-Docker) dev is unaffected either way.

   **Postgres / Supabase:**
   ```bash
   DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
   DATABASE_PROVIDER="postgresql"
   ```
   Get the connection string from your Supabase project's
   **Settings → Database**. `DATABASE_PROVIDER` defaults to `sqlite` when
   unset, so it must be set explicitly to `postgresql` here — the
   entrypoint uses it to switch the Prisma datasource accordingly. The
   `app_data` volume and the `prisma/dev.db` auto-copy are simply unused
   in this case.

2. Build and start the container:
   ```bash
   docker compose up --build -d
   ```
   The app is then available at http://localhost:3456. Logs (including
   whether an existing database was found/copied, and the
   migration/schema-sync output) are available with `docker compose logs -f`.

3. (Optional) bootstrap the map with this repo's real port/depot/route data,
   the same way as the "Bootstrapping map data" section above, just run
   inside the container:
   ```bash
   docker compose exec app npm run map:import
   ```

4. To stop/restart without losing data, use `docker compose stop` /
   `docker compose start`, or `docker compose down` (also fine — the
   `app_data` volume and any Postgres/Supabase database survive that; only
   `docker compose down -v` or `docker volume rm` deletes `app_data`).

Notes specific to the Docker setup:
- `AUTH_TRUST_HOST=true` is set because NextAuth v5 otherwise refuses to
  trust the container's request Host header by default (it can't know its
  own public URL ahead of time) — fine as long as the container only sits
  behind a reverse proxy you control, or on a trusted network.
- Switching providers: `prisma/schema.prisma` is committed with
  `provider = "sqlite"`, since Prisma requires that field to be a literal
  string (it can't read it from an env var like the connection URL can) —
  `docker-entrypoint.sh` rewrites it in place to match `DATABASE_PROVIDER`
  before every start, so the same schema file works for either database
  without you ever needing to edit it. The committed `prisma/migrations/`
  SQL files are SQLite-specific though, so a Postgres/Supabase database is
  brought in sync with `prisma db push` (schema-driven, safe to re-run)
  instead of replaying that migration history.
- The image installs and runs everything as `npm run start` (a normal
  `next start`, not Next's "standalone" output) so the Prisma CLI is
  available at container startup to run migrations/`db push` and, if you
  want, the `map:import` bootstrap script from step 3.

## Notes

- `npm install` requires `--legacy-peer-deps` due to an unrelated npm/arborist
  peer-resolution bug with some transitive deps.
- Jira credentials (API token, or OAuth access/refresh tokens if using that
  method) are encrypted (AES-256-GCM) before being stored in SQLite, and are
  only ever used server-side.
- Middleware (`src/proxy.ts`) protects all routes except `/login` and the auth
  API, using an Edge-safe NextAuth config (no Prisma in Edge runtime).
