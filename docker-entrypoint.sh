#!/bin/sh
# Entrypoint: makes the Prisma datasource match DATABASE_PROVIDER (sqlite by
# default, or postgresql for a Supabase/Postgres database — see README
# "Running with Docker"), brings the schema up to date, then hands off to
# the container's real command (`npm run start` by default — see the
# Dockerfile's CMD).
set -e

PROVIDER="${DATABASE_PROVIDER:-sqlite}"
echo "Database provider: $PROVIDER (DATABASE_URL=$DATABASE_URL)"

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
