# Multi-stage build: the first stage installs deps and builds the app, the
# final image only carries what's needed to run it (still ships the full
# node_modules rather than Next's "standalone" trace output, since the
# Prisma CLI is needed at container startup to run migrations against the
# mounted SQLite file — see docker-entrypoint.sh).

FROM node:22-alpine AS base
# Prisma's query engine needs OpenSSL; libc6-compat helps some native
# addons that expect glibc-style symbols run correctly on musl (alpine).
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# --legacy-peer-deps: see README "Notes" — unrelated npm/arborist bug with
# some transitive deps, not specific to Docker.
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generates the Prisma client into node_modules/@prisma/client before the
# Next build, since several routes import it at build time (type-checking/
# route analysis).
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# Next reads PORT/HOSTNAME at runtime; matches the port exposed below and
# the one used by `npm run dev`/`npm run start` outside Docker.
ENV PORT=3456
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Only src/lib is needed at runtime outside of the already-built .next
# output: prisma/importMapGeoJSON.ts (run via `npm run map:import`) imports
# lib/mapGeoJSON.ts directly with tsx rather than through Next's bundler,
# so its dependency needs to exist as a real file in the image.
COPY --from=builder /app/src/lib ./src/lib
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3456

# Applies any pending Prisma migrations to the (volume-mounted) SQLite
# database, then starts the app — every container start, so a fresh
# volume gets its schema created automatically and upgrades on
# subsequent `docker compose up` after a `git pull` are hands-off too.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
