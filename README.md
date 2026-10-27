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

## Set up admin account

Set `ADMIN_EMAIL` in `.env.local` or your deployment environment; it defaults to `adam.esbjornsson@surikat.se`. Public registration is disabled, and startup creates the admin account without a default password while preserving existing accounts and data. Once the app is running, generate a setup link with the appropriate command below. The email is required; replace it with your configured admin email and use your app's URL.

```sh
# Running locally
npm run auth:setup -- adam.esbjornsson@surikat.se http://localhost:3456

# Running in Docker
docker compose exec app npm run auth:setup -- adam.esbjornsson@surikat.se http://localhost:3456
```

Open the private, single-use link within one hour, choose a password, then sign in. Passwords persist in the database; use the same command for a replacement link. Add other users through **Settings → User accounts → Add user**. After changing `ADMIN_EMAIL`, restart the app or recreate the container with `docker compose up -d --force-recreate`; the previous admin becomes a regular user without losing data.

## Run in Docker

Configure `.env.local` and copy `.env.docker.example` to `.env.docker`, then start Compose and open `http://localhost:3456`. Startup applies migrations and seeds empty maps; SQLite persists in `app_data`, initially copying `prisma/dev.db` if available.

```sh
docker compose up --build -d
```

## Deploy to Rancher or another Docker host

Build and push to your registry, then deploy that image with the environment variables above supplied through your host's settings/secrets. Route HTTPS traffic to container port `3456` and register OAuth callbacks using your public origin. For SQLite, mount persistent storage at `/app/data` and run one replica; alternatively, configure Postgres. Startup applies the schema and seeds empty maps from `prisma/mapData.geojson`.

```sh
docker build -t registry.example.com/lx-assistant:latest .
docker push registry.example.com/lx-assistant:latest
```
