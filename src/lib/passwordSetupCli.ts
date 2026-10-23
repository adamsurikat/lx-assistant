import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [email, origin = "http://localhost:3456"] = process.argv.slice(2);
  if (!email) throw new Error("Usage: npm run auth:setup -- user@example.com [http://localhost:3456]");
  const url = new URL("/set-password", origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP or HTTPS app URL.");
  const { createPasswordSetupToken } = await import("./localAuth");
  const { prisma } = await import("./prisma");
  try {
    url.hash = new URLSearchParams({ token: await createPasswordSetupToken(email) }).toString();
    console.log(`Open this private, single-use link within one hour:\n${url}`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
