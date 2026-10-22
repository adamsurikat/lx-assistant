import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test, type TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";

let directory: string;
let prisma: PrismaClient;
let cache: typeof import("./jiraFixVersionCache");
const oldDatabaseUrl = process.env.DATABASE_URL;
const oldEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "lx-jira-version-cache-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: process.env, stdio: "pipe",
  });
  // Import only after pointing the client at an isolated database.
  prisma = (await import("./prisma")).prisma;
  cache = await import("./jiraFixVersionCache");
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
  if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = oldDatabaseUrl;
  if (oldEncryptionKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = oldEncryptionKey;
});

async function user(t: TestContext) {
  const { encryptSecret } = await import("./crypto");
  const result = await prisma.user.create({ data: {
    jiraEmail: "test@example.test", jiraSiteUrl: "https://jira.example.test",
    jiraApiTokenCipher: encryptSecret("test-token"),
  } });
  t.after(() => prisma.user.delete({ where: { id: result.id } }));
  return result.id;
}

function jiraResponse(url: string, names: string[]) {
  return Response.json({ startAt: 0, isLast: true, values: url.includes("/project/search")
    ? [{ id: "10000" }] : names.map((name) => ({ name })) });
}

test("reading cached versions uses only the database and is scoped to the user", async (t) => {
  const first = await user(t);
  const second = await user(t);
  await prisma.jiraFixVersionCache.create({ data: { userId: first, versionsJson: '["2026.10.21-0"]' } });
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected Jira request"); });
  assert.deepEqual(await cache.getCachedJiraFixVersions(first), ["2026.10.21-0"]);
  assert.equal(await cache.getCachedJiraFixVersions(second), null);
  assert.equal(fetch.mock.callCount(), 0);
});

test("a successful refresh persists filtered versions across database connections", async (t) => {
  const id = await user(t);
  t.mock.method(globalThis, "fetch", async (url: string) => jiraResponse(url, ["2026.10.21-0", "not-a-release"]));
  assert.deepEqual(await cache.refreshJiraFixVersions(id), ["2026.10.21-0"]);
  const { PrismaClient } = await import("@prisma/client");
  const reopened = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const saved = await reopened.jiraFixVersionCache.findUniqueOrThrow({ where: { userId: id } });
    assert.deepEqual(JSON.parse(saved.versionsJson), ["2026.10.21-0"]);
    assert.ok(saved.updatedAt instanceof Date);
  } finally { await reopened.$disconnect(); }
});

test("failed refreshes preserve the last successful snapshot and can be retried", async (t) => {
  const id = await user(t);
  const saved = await prisma.jiraFixVersionCache.create({ data: { userId: id, versionsJson: '["2026.10.21-0"]' } });
  const failedFetch = t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(cache.refreshJiraFixVersions(id), /503/);
  assert.deepEqual(await prisma.jiraFixVersionCache.findUnique({ where: { userId: id } }), saved);
  failedFetch.mock.restore();
  t.mock.method(globalThis, "fetch", async (url: string) => jiraResponse(url, ["2026.10.22-0"]));
  assert.deepEqual(await cache.refreshJiraFixVersions(id), ["2026.10.22-0"]);
  assert.deepEqual(await cache.getCachedJiraFixVersions(id), ["2026.10.22-0"]);
});

test("concurrent requests share one refresh for the same user", async (t) => {
  const id = await user(t);
  const fetch = t.mock.method(globalThis, "fetch", async (url: string) => jiraResponse(url, ["2026.10.21-0"]));
  const first = cache.refreshJiraFixVersions(id);
  const second = cache.refreshJiraFixVersions(id);
  assert.equal(first, second);
  assert.deepEqual(await first, ["2026.10.21-0"]);
  assert.equal(fetch.mock.callCount(), 2);
});

test("a successful empty result replaces stale versions and is distinct from an uninitialized cache", async (t) => {
  const id = await user(t);
  await prisma.jiraFixVersionCache.create({ data: { userId: id, versionsJson: '["2026.10.21-0"]' } });
  t.mock.method(globalThis, "fetch", async (url: string) => jiraResponse(url, []));
  assert.deepEqual(await cache.refreshJiraFixVersions(id), []);
  assert.deepEqual(await cache.getCachedJiraFixVersions(id), []);
});

test("changing the Jira connection cancels an active refresh before clearing its saved versions", async (t) => {
  const id = await user(t);
  await prisma.jiraFixVersionCache.create({ data: { userId: id, versionsJson: '["2026.10.21-0"]' } });
  let started!: () => void;
  const fetching = new Promise<void>((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    started();
  }));
  const rejected = assert.rejects(cache.refreshJiraFixVersions(id), { name: "AbortError" });
  await fetching;
  await cache.invalidateJiraFixVersionCache(id);
  await rejected;
  assert.equal(await cache.getCachedJiraFixVersions(id), null);
});
