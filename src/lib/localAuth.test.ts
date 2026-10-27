import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
const oldAdminEmail = process.env.ADMIN_EMAIL;
const password = "correct horse battery staple";
const adminEmail = "admin@example.test";

async function createAdmin() {
  return (await local.setupAdminAccount(adminEmail)).user;
}

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "lx-local-auth-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  prisma = (await import("./prisma")).prisma;
  local = await import("./localAuth");
  requests = await import("./authRequest");
});
beforeEach(async () => {
  delete process.env.ADMIN_EMAIL;
  await prisma.user.deleteMany();
  await prisma.authRateLimit.deleteMany();
});
after(async () => {
  await prisma?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
  if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  if (oldAdminEmail === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = oldAdminEmail;
});

test("admin-created accounts normalize emails and activate without Google; login hashes passwords and rejects bad credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Authentication must not contact Google"); });
  const admin = await createAdmin();
  const { user: created, token } = await local.createUserByAdmin(admin.id, { name: " Ada ", email: " Ada@Example.test " });
  assert.deepEqual({ name: created.name, email: created.email }, { name: "Ada", email: "ada@example.test" });
  assert.equal("passwordHash" in created, false);
  assert.equal(created.isAdmin, false);
  assert.equal(await local.authenticateUser(created.email, password), null);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).passwordHash, null);
  const setup = await prisma.passwordSetupToken.findUniqueOrThrow({ where: { userId: created.id } });
  assert.notEqual(setup.tokenHash, token);
  await local.setPasswordWithToken(token, password);
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
  assert.ok(saved.passwordHash?.startsWith("scrypt:"));
  assert.ok(!saved.passwordHash!.includes(password));
  assert.equal((await local.authenticateUser("ADA@example.test", password))?.id, created.id);
  assert.equal(await local.authenticateUser(created.email, "wrong password"), null);
  assert.equal(await local.authenticateUser("missing@example.test", password), null);
  assert.equal(await local.authenticateUser(created.email, "x".repeat(129)), null);
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "Other", email: "ADA@example.test" }), /already exists/);
  assert.equal(await prisma.user.count(), 2);
  await assert.rejects(local.setPasswordWithToken(token, password), /invalid or expired/);
});

test("an existing Google-only account cannot be replaced; setup preserves its data", async () => {
  const admin = await createAdmin();
  const user = await prisma.user.create({ data: { name: "Existing", email: "old@example.test", jiraApiTokenCipher: "keep-this" } });
  await prisma.postIt.create({ data: { userId: user.id, text: "Keep my note" } });
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "Intruder", email: user.email }), /already exists/);
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
  const admin = await createAdmin();
  const { user, token: invitation } = await local.createUserByAdmin(admin.id, { name: "Ada", email: "change@example.test" });
  await local.setPasswordWithToken(invitation, password);
  const token = await local.createPasswordSetupToken(user.email);
  await assert.rejects(local.changePassword(user.id, "incorrect", "another long password"), /Current password/);
  await local.changePassword(user.id, password, "another long password");
  assert.equal(await local.authenticateUser(user.email, password), null);
  assert.equal((await local.authenticateUser(user.email, "another long password"))?.id, user.id);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 2);
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
  const request = (origin: string, body = '{}', contentType = 'application/json') => new Request('http://localhost:3456/api/admin/users', {
    method: 'POST', headers: { host: '192.168.11.220:3456', origin, 'content-type': contentType }, body,
  });
  assert.deepEqual(await requests.readAuthJson(request('http://192.168.11.220:3456')), {});
  await assert.rejects(requests.readAuthJson(request('https://evil.example')), /origin/);
  await assert.rejects(requests.readAuthJson(request('http://192.168.11.220:3456', '{}', 'text/plain')), /Expected JSON/);
  await assert.rejects(requests.readAuthJson(request('http://192.168.11.220:3456', '{')), /Invalid JSON/);
  await assert.rejects(requests.readAuthJson(request('http://192.168.11.220:3456', 'x'.repeat(4097))), /too large/);
});

test("admin setup creates a normalized account, persists its role and preserves its credentials when rerun", async () => {
  const { user: admin, token } = await local.setupAdminAccount(" ADMIN@Example.test ");
  assert.equal(admin.email, adminEmail);
  assert.equal(admin.isAdmin, true);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash, null);
  const setup = await prisma.passwordSetupToken.findUniqueOrThrow({ where: { userId: admin.id } });
  assert.notEqual(setup.tokenHash, token);
  assert.ok(setup.expiresAt.getTime() > Date.now());
  assert.ok(setup.expiresAt.getTime() <= Date.now() + 60 * 60_000);
  await local.setPasswordWithToken(token, password);
  await prisma.postIt.create({ data: { userId: admin.id, text: "Keep my data" } });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  const repeated = await local.setupAdminAccount(adminEmail);
  assert.equal(repeated.user.id, admin.id);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal(after.isAdmin, true);
  assert.equal(await prisma.user.count(), 1);
  assert.equal(await prisma.postIt.count({ where: { userId: admin.id } }), 1);
  assert.equal((await local.requireAdminUser(admin.id)).id, admin.id);
  await local.setPasswordWithToken(repeated.token, "another admin password");
  assert.equal((await local.authenticateUser(adminEmail, "another admin password"))?.id, admin.id);
  await assert.rejects(local.setPasswordWithToken(repeated.token, password), /invalid or expired/);
});

test("anonymous users and non-admin users cannot create accounts or list users", async () => {
  const admin = await createAdmin();
  const member = await prisma.user.create({ data: { email: "member@example.test", name: adminEmail } });
  const input = { name: "New user", email: "new@example.test" };
  for (const id of [undefined, "missing", member.id]) {
    const status = id === member.id ? 403 : 401;
    await assert.rejects(local.createUserByAdmin(id, input), (error: unknown) => error instanceof local.AuthInputError && error.status === status);
    await assert.rejects(local.listUsersForAdmin(id), (error: unknown) => error instanceof local.AuthInputError && error.status === status);
  }
  assert.equal(await prisma.user.count(), 2);
  assert.equal(await prisma.passwordSetupToken.count(), 1);
  // Authorization uses the current database role, not an old session claim.
  await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: false } });
  await assert.rejects(local.requireAdminUser(admin.id), /Only administrators/);
});

test("admin user listings exclude password hashes and integrations, and invitation input cannot grant admin", async () => {
  const admin = await createAdmin();
  const input = { name: "Member", email: "member@example.test", isAdmin: true, password };
  const { user } = await local.createUserByAdmin(admin.id, input);
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(saved.passwordHash, null);
  await assert.rejects(local.requireAdminUser(user.id), /Only administrators/);
  const users = await local.listUsersForAdmin(admin.id);
  assert.equal(users.find((entry) => entry.id === admin.id)?.isAdmin, true);
  assert.equal(users.find((entry) => entry.id === user.id)?.isAdmin, false);
  for (const entry of users) {
    assert.deepEqual(Object.keys(entry).sort(), ["email", "id", "isAdmin", "name", "passwordSet"]);
  }
});

test("public registration rejects every request without creating an account", async () => {
  const { POST } = await import("../app/api/auth/register/route");
  const response = await POST();
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match((await response.json()).error, /Self-registration is disabled/);
  assert.equal(await prisma.user.count(), 0);
});

test("invalid invitations and duplicate owner accounts never overwrite existing accounts", async () => {
  const admin = await createAdmin();
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "", email: "valid@example.test" }), /Enter a name/);
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "User", email: "invalid" }), /valid email/);
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "Intruder", email: adminEmail.toUpperCase() }), /already exists/);
  assert.equal(await prisma.user.count(), 1);
  assert.equal(await prisma.passwordSetupToken.count(), 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).name, admin.name);
});

test("admin setup promotes an existing user without replacing their profile, password or data", async () => {
  const user = await prisma.user.create({ data: { email: "existing-admin@example.test", name: "Existing owner", jiraApiTokenCipher: "keep-this" } });
  await prisma.postIt.create({ data: { userId: user.id, text: "Keep my note" } });
  const oldToken = await local.createPasswordSetupToken(user.email);
  await local.setPasswordWithToken(oldToken, password);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const { user: admin } = await local.setupAdminAccount(user.email);
  assert.equal(admin.id, user.id);
  assert.equal(admin.name, user.name);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal(after.jiraApiTokenCipher, "keep-this");
  assert.equal(after.isAdmin, true);
  assert.equal(await prisma.postIt.count({ where: { userId: user.id } }), 1);
  assert.equal(await prisma.user.count(), 1);
  assert.equal((await local.requireAdminUser(user.id)).id, user.id);
});

test("additional admins retain independent roles and neither email nor environment grants access", async () => {
  const first = await createAdmin();
  const { user: second } = await local.setupAdminAccount("second-admin@example.test");
  const member = await prisma.user.create({ data: { email: "adam.esbjornsson@surikat.se" } });
  process.env.ADMIN_EMAIL = member.email!;
  await assert.rejects(local.requireAdminUser(member.id), /Only administrators/);
  await prisma.user.update({ where: { id: first.id }, data: { email: "renamed-admin@example.test" } });
  assert.equal((await local.requireAdminUser(first.id)).id, first.id);
  assert.equal((await local.requireAdminUser(second.id)).id, second.id);
  const users = await local.listUsersForAdmin(first.id);
  assert.deepEqual(users.filter((entry) => entry.isAdmin).map((entry) => entry.id).sort(), [first.id, second.id].sort());
});

test("the auth:setup command creates and promotes admins, prints a usable link and replaces previous links", async () => {
  const run = (args: string[]) => execFileSync(process.execPath, ["--import", "tsx", "src/lib/passwordSetupCli.ts", ...args], { env: process.env, encoding: "utf8" });
  const output = run([" CLI.Admin@Example.test ", "https://app.example.test"]);
  assert.match(output, /Admin account ready: cli.admin@example.test/);
  const url = new URL(output.split("\n").find((line) => line.startsWith("https://"))!);
  assert.equal(url.origin, "https://app.example.test");
  assert.equal(url.pathname, "/set-password");
  assert.equal(url.search, "");
  const firstToken = new URLSearchParams(url.hash.slice(1)).get("token");
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "cli.admin@example.test" } });
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.passwordHash, null);
  // Simulate an existing regular account to exercise promotion through the actual CLI.
  await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: false, name: "CLI owner" } });
  const repeated = run([admin.email!]);
  const nextUrl = new URL(repeated.split("\n").find((line) => line.startsWith("http://"))!);
  assert.equal(nextUrl.origin, "http://localhost:3456");
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isAdmin, true);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).name, "CLI owner");
  assert.equal(await prisma.user.count(), 1);
  await assert.rejects(local.setPasswordWithToken(firstToken, password), /invalid or expired/);
  await local.setPasswordWithToken(new URLSearchParams(nextUrl.hash.slice(1)).get("token"), password);
  assert.equal((await local.authenticateUser(admin.email, password))?.id, admin.id);
});

test("invalid admin setup command arguments cannot create or promote an account", async () => {
  const existing = await prisma.user.create({ data: { email: adminEmail } });
  for (const args of [[], ["invalid"], [""], [adminEmail, "ftp://example.test"], [adminEmail, "not-a-url"], [adminEmail, "http://localhost:3456", "extra"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/lib/passwordSetupCli.ts", ...args], { env: process.env, encoding: "utf8" });
    assert.equal(result.status, 1);
  }
  assert.equal(await prisma.user.count(), 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).isAdmin, false);
  assert.equal(await prisma.passwordSetupToken.count(), 0);
});
