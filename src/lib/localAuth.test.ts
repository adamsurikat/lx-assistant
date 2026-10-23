import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";

let directory: string;
let prisma: PrismaClient;
let local: typeof import("./localAuth");
let requests: typeof import("./authRequest");
const oldUrl = process.env.DATABASE_URL;
const password = "correct horse battery staple";

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "lx-local-auth-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  prisma = (await import("./prisma")).prisma;
  local = await import("./localAuth");
  requests = await import("./authRequest");
});
beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.authRateLimit.deleteMany();
});
after(async () => {
  await prisma?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
  if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
});

test("registration and login work without Google and normalize emails, hash passwords, and reject bad credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Authentication must not contact Google"); });
  const created = await local.registerUser({ name: " Ada ", email: " Ada@Example.test ", password });
  assert.deepEqual({ name: created.name, email: created.email }, { name: "Ada", email: "ada@example.test" });
  assert.equal("passwordHash" in created, false);
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
  assert.ok(saved.passwordHash?.startsWith("scrypt:"));
  assert.ok(!saved.passwordHash!.includes(password));
  assert.equal((await local.authenticateUser("ADA@example.test", password))?.id, created.id);
  assert.equal(await local.authenticateUser(created.email, "wrong password"), null);
  assert.equal(await local.authenticateUser("missing@example.test", password), null);
  assert.equal(await local.authenticateUser(created.email, "x".repeat(129)), null);
  await assert.rejects(local.registerUser({ name: "Other", email: "ADA@example.test", password }), /Unable to register/);
  assert.equal(await prisma.user.count(), 1);
});

test("an existing Google-only account cannot be claimed through registration; setup preserves its data", async () => {
  const user = await prisma.user.create({ data: { name: "Existing", email: "old@example.test", jiraApiTokenCipher: "keep-this" } });
  await prisma.postIt.create({ data: { userId: user.id, text: "Keep my note" } });
  await assert.rejects(local.registerUser({ name: "Intruder", email: user.email, password }), /Unable to register/);
  assert.equal(await local.authenticateUser(user.email, password), null);
  const token = await local.createPasswordSetupToken(user.email);
  const saved = await prisma.passwordSetupToken.findUniqueOrThrow({ where: { userId: user.id } });
  assert.notEqual(saved.tokenHash, token);
  await local.setPasswordWithToken(token, password);
  assert.equal((await local.authenticateUser(user.email, password))?.id, user.id);
  const changed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(changed.jiraApiTokenCipher, "keep-this");
  assert.equal(changed.sessionVersion, 1);
  assert.equal(await prisma.postIt.count({ where: { userId: user.id } }), 1);
  await assert.rejects(local.setPasswordWithToken(token, "a second new password"), /invalid or expired/);
});

test("password setup links expire and replacement links revoke earlier ones", async () => {
  const user = await prisma.user.create({ data: { email: "reset@example.test" } });
  const first = await local.createPasswordSetupToken(user.email);
  const second = await local.createPasswordSetupToken(user.email);
  await assert.rejects(local.setPasswordWithToken(first, password), /invalid or expired/);
  await prisma.passwordSetupToken.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(local.setPasswordWithToken(second, password), /invalid or expired/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, null);
});

test("changing a password verifies the current one, invalidates sessions and setup links", async () => {
  const user = await local.registerUser({ name: "Ada", email: "change@example.test", password });
  const token = await local.createPasswordSetupToken(user.email);
  await assert.rejects(local.changePassword(user.id, "incorrect", "another long password"), /Current password/);
  await local.changePassword(user.id, password, "another long password");
  assert.equal(await local.authenticateUser(user.email, password), null);
  assert.equal((await local.authenticateUser(user.email, "another long password"))?.id, user.id);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);
  await assert.rejects(local.setPasswordWithToken(token, password), /invalid or expired/);
});

test("rate limits count simultaneous requests atomically and expire", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => local.consumeAuthAttempt("same-identity", 3)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
  assert.equal(results.filter((result) => result.status === "rejected").length, 5);
  const bucket = await prisma.authRateLimit.findFirstOrThrow();
  assert.equal(bucket.attempts, 8);
  assert.ok(!bucket.key.includes("same-identity"));
  await prisma.authRateLimit.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
  await local.consumeAuthAttempt("same-identity", 3);
});

test("account mutations require same-origin JSON, including LAN origins", async () => {
  const request = (origin: string, body = '{}', contentType = 'application/json') => new Request('http://localhost:3456/api/auth/register', {
    method: 'POST', headers: { host: '192.168.11.220:3456', origin, 'content-type': contentType }, body,
  });
  assert.deepEqual(await requests.readAuthJson(request('http://192.168.11.220:3456')), {});
  await assert.rejects(requests.readAuthJson(request('https://evil.example')), /origin/);
  await assert.rejects(requests.readAuthJson(request('http://192.168.11.220:3456', '{}', 'text/plain')), /Expected JSON/);
  await assert.rejects(requests.readAuthJson(request('http://192.168.11.220:3456', '{')), /Invalid JSON/);
  await assert.rejects(requests.readAuthJson(request('http://192.168.11.220:3456', 'x'.repeat(4097))), /too large/);
});
