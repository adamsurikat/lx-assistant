# Jira Time Calendar

## Environment

Copy `.env.local.example` to `.env.local`. `AUTH_SECRET` secures sessions; `TOKEN_ENCRYPTION_KEY` encrypts Jira credentials—generate each separately with `openssl rand -base64 32`. `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are your Google OAuth client ID and secret; register `<origin>/api/auth/callback/google`. `AUTH_TRUST_HOST=true` allows localhost or a trusted reverse proxy. `DATABASE_URL` selects the database: the committed `.env` uses `file:./dev.db` locally; containers use `file:/app/data/dev.db` or a Postgres URL. Container-only `DATABASE_PROVIDER` defaults to `sqlite`; set `postgresql` for Postgres. Optional `JIRA_OAUTH_CLIENT_ID` and `JIRA_OAUTH_CLIENT_SECRET` enable Atlassian OAuth with callback `<origin>/api/jira/callback`; omit both to use a Jira API token in Settings.

## Run locally

Use Node.js 26 and configure `.env.local`, then run the commands below. Open `http://localhost:3456`, sign in with Google, and connect Jira in Settings.

```sh
npm ci --legacy-peer-deps
npx prisma migrate dev
npm run dev
```

## Run in Docker

Configure `.env.local` and copy `.env.docker.example` to `.env.docker` for database settings, then start Compose. Open `http://localhost:3456`. Startup applies the schema automatically; SQLite persists in the `app_data` volume, initially copying `prisma/dev.db` if available.

```sh
docker compose up --build -d
```

## Deploy to Rancher or another Docker host

Build and push to your registry, then deploy that image with the environment variables above supplied through your host's settings/secrets. Route HTTPS traffic to container port `3456` and register OAuth callbacks using your public origin. For SQLite, mount persistent storage at `/app/data` and run one replica; alternatively, configure Postgres. Startup applies the schema automatically.

```sh
docker build -t registry.example.com/lx-assistant:latest .
docker push registry.example.com/lx-assistant:latest
```
