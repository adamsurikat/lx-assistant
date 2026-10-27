# Jira Time Calendar

## Environment

Copy `.env.local.example` to `.env.local` and fill in your credentials. Generate each secret separately with `openssl rand -base64 32`. Register the OAuth callbacks below, replacing `<origin>` with your app URL.

```dotenv
# .env.local
AUTH_SECRET="..."          # Session signing secret
TOKEN_ENCRYPTION_KEY="..." # Jira/Calendar token encryption: 32 bytes, base64
AUTH_TRUST_HOST=true       # Localhost or a trusted reverse proxy
ADMIN_EMAIL="adam.esbjornsson@surikat.se" # The only admin account

# Optional Google Calendar: <origin>/api/auth/callback/google
# AUTH_GOOGLE_ID="..."     # Client ID
# AUTH_GOOGLE_SECRET="..." # Client secret

# Optional Atlassian OAuth: <origin>/api/jira/callback
# Omit both to use a Jira API token in Settings.
# JIRA_OAUTH_CLIENT_ID="..."
# JIRA_OAUTH_CLIENT_SECRET="..."
```

```dotenv
# .env — already configured for local SQLite
DATABASE_URL="file:./dev.db"
```

```dotenv
# .env.docker — container database settings only
DATABASE_URL="file:/app/data/dev.db" # Persistent SQLite database

# DATABASE_PROVIDER defaults to sqlite. For Postgres, replace the above with:
# DATABASE_URL="postgresql://user:password@host:5432/database"
# DATABASE_PROVIDER="postgresql"
```

## Run locally

Use Node.js 26 and configure `.env.local`, then run the commands below. Open `http://localhost:3456` and sign in with email/password; connect Jira and optional Google Calendar in Settings. Startup ensures the admin account exists and seeds empty maps from `prisma/mapData.geojson`.

```sh
npm ci --legacy-peer-deps
npx prisma migrate dev
npm run dev
```

## User accounts

Public registration is disabled. Set `ADMIN_EMAIL` in `.env.local` or your deployment's environment variables to choose the only admin account. It defaults to `adam.esbjornsson@surikat.se` when unset. The address is trimmed and lowercased; blank or invalid values prevent startup. Startup creates the configured account if it is missing and preserves any existing name, password and data.

Restart the app after changing `ADMIN_EMAIL` (recreate the container with `docker compose up -d --force-recreate` when using Compose). The new address gains admin access and the previous address becomes a regular user; existing accounts and data are retained. This setting is read at runtime, so changing it does not require rebuilding the image.

For the admin's first sign-in, generate a private, single-use password setup link, replacing the address below with your configured `ADMIN_EMAIL`:

```sh
npm run auth:setup -- adam.esbjornsson@surikat.se
```

Sign in as the admin, open **Settings → User accounts**, and use **Add user**. Copy the generated link and share it privately with that user so they can choose their password. Links expire after one hour. Existing accounts, including Google-only accounts, can get a replacement setup link with `npm run auth:setup -- user@example.com [https://your-app-origin]`. No default passwords are assigned.

## Run in Docker

Configure `.env.local` (including `ADMIN_EMAIL`) and copy `.env.docker.example` to `.env.docker`, then start Compose. Open `http://localhost:3456` and sign in; use `docker compose exec app npm run auth:setup -- adam.esbjornsson@surikat.se` for the admin's initial password, substituting your configured admin email. Existing accounts can get a setup link using the same command with their email. Startup applies migrations, ensures the admin account exists, and seeds empty maps; SQLite persists in `app_data`, initially copying `prisma/dev.db` if available.

```sh
docker compose up --build -d
```

## Deploy to Rancher or another Docker host

Build and push to your registry, then deploy that image with the environment variables above supplied through your host's settings/secrets. Route HTTPS traffic to container port `3456` and register OAuth callbacks using your public origin. For SQLite, mount persistent storage at `/app/data` and run one replica; alternatively, configure Postgres. Startup applies the schema and seeds empty maps from `prisma/mapData.geojson`.

```sh
docker build -t registry.example.com/lx-assistant:latest .
docker push registry.example.com/lx-assistant:latest
```
