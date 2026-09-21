// Seeds the fixed set of feature flags used to tag map items (ports,
// depots, routes) — see FeatureFlag in prisma/schema.prisma. These three
// are hardcoded/known in advance rather than user-creatable, so this script
// (rather than the map UI) is the source of truth for them.
//
// Safe to re-run: existing flags (matched by name) are left untouched.
//
// Usage: npx tsx prisma/seedFeatureFlags.ts
// Also runs automatically via `npx prisma db seed`.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FEATURE_FLAGS = [
  { name: "tos" },
  { name: "gos" },
  { name: "booking" },
];

async function main() {
  for (const flag of FEATURE_FLAGS) {
    const result = await prisma.featureFlag.upsert({
      where: { name: flag.name },
      update: {},
      create: flag,
    });
    console.log(`Feature flag "${result.name}" ready (id: ${result.id})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
