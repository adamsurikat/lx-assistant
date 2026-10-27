import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const [email, origin = "http://localhost:3456"] = args;
  if (!email || args.length > 2) throw new Error("Usage: npm run auth:setup -- admin@example.com [http://localhost:3456]\nCreates or promotes an admin account and prints a password setup link.");
  const url = new URL("/set-password", origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP or HTTPS app URL.");
  const { setupAdminAccount } = await import("./localAuth");
  const { prisma } = await import("./prisma");
  try {
    const { user, token } = await setupAdminAccount(email);
    url.hash = new URLSearchParams({ token }).toString();
    console.log(`Admin account ready: ${user.email}\nOpen this private, single-use link within one hour:\n${url}`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
