import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot-reloads in dev to avoid
// exhausting SQLite connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaGeneration?: number };

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === "production") return new PrismaClient();

  // Regeneration changes the generated module, but Node can retain both its
  // old constructor and the cached instance across Next.js hot reloads.
  const load = createRequire(`${process.cwd()}/package.json`);
  const entry = load.resolve(".prisma/client");
  const generation = statSync(entry).mtimeMs;
  if (globalForPrisma.prisma && globalForPrisma.prismaGeneration === generation) {
    return globalForPrisma.prisma;
  }

  delete load.cache[entry];
  const { PrismaClient: CurrentPrismaClient } = load(entry) as typeof import("@prisma/client");
  const previous = globalForPrisma.prisma;
  const client = new CurrentPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaGeneration = generation;
  if (previous) void previous.$disconnect().catch(console.error);
  return client;
}

export const prisma = getPrismaClient();
