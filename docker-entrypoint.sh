#!/bin/sh
# Entrypoint: makes the Prisma datasource match DATABASE_PROVIDER (sqlite by
# default, or postgresql for a Supabase/Postgres database — see README
# "Running with Docker"), brings the schema up to date, then hands off to
# the container's real command (`npm run start` by default — see the
# Dockerfile's CMD).
set -e

PROVIDER="${DATABASE_PROVIDER:-sqlite}"
echo "Database provider: $PROVIDER (DATABASE_URL=$DATABASE_URL)"

if [ "$PROVIDER" = "sqlite" ]; then
  # Priority: reuse an existing database file if one is already present in
  # the persistent app_data volume (a previous container run) — otherwise,
  # if the host has a local dev.db (from `npm run dev`, read-only bind
  # mounted at /host-prisma by docker-compose.yml), seed the volume with a
  # copy of that as the starting point instead of an empty database. Only
  # ever a one-time copy on an empty volume: the container's own writes
  # after this never touch the host's file.
  DB_PATH="${DATABASE_URL#file:}"
  if [ ! -f "$DB_PATH" ] && [ -f /host-prisma/dev.db ]; then
    echo "No existing database at $DB_PATH; copying host's prisma/dev.db as the starting point..."
    mkdir -p "$(dirname "$DB_PATH")"
    cp /host-prisma/dev.db "$DB_PATH"
  fi
fi

# prisma/schema.prisma ships with the datasource provider hardcoded to
# "sqlite" (Prisma requires a literal string here, not env()) — patch it in
# place to match DATABASE_PROVIDER before touching the database. Only the
# datasource's provider value is ever "sqlite" or "postgresql" (the
# generator block's is "prisma-client-js", never matched), and rewriting it
# to its current value on a plain restart is a harmless no-op, so this is
# safe to run unconditionally every start.
sed -i \
  -e "s/provider = \"sqlite\"/provider = \"$PROVIDER\"/" \
  -e "s/provider = \"postgresql\"/provider = \"$PROVIDER\"/" \
  prisma/schema.prisma

npx prisma generate

if [ "$PROVIDER" = "postgresql" ]; then
  # The committed prisma/migrations/*.sql files are SQLite-specific (Prisma
  # migration SQL isn't portable across providers), so a Postgres/Supabase
  # database is instead brought in sync directly from the current schema
  # via `db push` rather than replayed migration history. Safe to re-run:
  # it diffs against the live database and only applies what's changed.
  echo "Syncing schema to Postgres via 'prisma db push'..."
  npx prisma db push --skip-generate --accept-data-loss
else
  echo "Applying SQLite migrations..."
  npx prisma migrate deploy
fi

exec "$@"
