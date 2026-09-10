#!/bin/sh
# Entrypoint: applies pending Prisma migrations to whatever database
# DATABASE_URL points at (normally a volume-mounted SQLite file, so this
# runs against persistent data rather than the throwaway one baked into the
# image), then hands off to the container's real command (`npm run start`
# by default — see the Dockerfile's CMD).
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

exec "$@"
