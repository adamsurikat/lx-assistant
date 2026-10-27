import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ADMIN_EMAIL, getAdminEmail, isAdminEmail } from "./adminPolicy";

let directory: string;
let prisma: PrismaClient;
let local: typeof import("./localAuth");
let requests: typeof import("./authRequest");
const oldUrl = process.env.DATABASE_URL;
const oldAdminEmail = process.env.ADMIN_EMAIL;
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
  const admin = await local.ensureAdminAccount();
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
  const admin = await local.ensureAdminAccount();
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
  const admin = await local.ensureAdminAccount();
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

test("the default owner is admin when ADMIN_EMAIL is unset and startup preserves their password, session and data", async () => {
  const admin = await local.ensureAdminAccount();
  assert.equal(admin.email, DEFAULT_ADMIN_EMAIL);
  assert.equal(isAdminEmail(admin.email), true);
  assert.equal(isAdminEmail(" ADAM.ESBJORNSSON@SURIKAT.SE "), true);
  assert.equal(isAdminEmail("adam.esbjornsson@surikat.se.evil.test"), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash, null);
  const token = await local.createPasswordSetupToken(admin.email);
  await local.setPasswordWithToken(token, password);
  await prisma.postIt.create({ data: { userId: admin.id, text: "Keep my data" } });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  assert.equal((await local.ensureAdminAccount()).id, admin.id);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal(await prisma.user.count(), 1);
  assert.equal(await prisma.postIt.count({ where: { userId: admin.id } }), 1);
  assert.equal((await local.requireAdminUser(admin.id)).id, admin.id);
});

test("anonymous users and non-admin users cannot create accounts or list users", async () => {
  const admin = await local.ensureAdminAccount();
  const member = await prisma.user.create({ data: { email: "member@example.test", name: DEFAULT_ADMIN_EMAIL } });
  const input = { name: "New user", email: "new@example.test" };
  for (const id of [undefined, "missing", member.id]) {
    const status = id === member.id ? 403 : 401;
    await assert.rejects(local.createUserByAdmin(id, input), (error: unknown) => error instanceof local.AuthInputError && error.status === status);
    await assert.rejects(local.listUsersForAdmin(id), (error: unknown) => error instanceof local.AuthInputError && error.status === status);
  }
  assert.equal(await prisma.user.count(), 2);
  assert.equal(await prisma.passwordSetupToken.count(), 0);
  // Authorization uses the current database identity, not an old session claim.
  await prisma.user.update({ where: { id: admin.id }, data: { email: "former-admin@example.test" } });
  await assert.rejects(local.requireAdminUser(admin.id), /Only the administrator/);
});

test("admin user listings exclude password hashes and integrations, and invitation input cannot grant admin", async () => {
  const admin = await local.ensureAdminAccount();
  const input = { name: "Member", email: "member@example.test", isAdmin: true, password };
  const { user } = await local.createUserByAdmin(admin.id, input);
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(saved.passwordHash, null);
  await assert.rejects(local.requireAdminUser(user.id), /Only the administrator/);
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
  const admin = await local.ensureAdminAccount();
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "", email: "valid@example.test" }), /Enter a name/);
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "User", email: "invalid" }), /valid email/);
  await assert.rejects(local.createUserByAdmin(admin.id, { name: "Intruder", email: DEFAULT_ADMIN_EMAIL.toUpperCase() }), /already exists/);
  assert.equal(await prisma.user.count(), 1);
  assert.equal(await prisma.passwordSetupToken.count(), 0);
  assert.equal((await local.ensureAdminAccount()).name, admin.name);
});

test("ADMIN_EMAIL configures the seeded admin and replaces the previous owner's access at runtime", async () => {
  const previous = await local.ensureAdminAccount();
  process.env.ADMIN_EMAIL = " New.Owner@Example.test ";
  assert.equal(getAdminEmail(), "new.owner@example.test");
  const admin = await local.ensureAdminAccount();
  assert.equal(admin.email, "new.owner@example.test");
  assert.equal(admin.name, "Administrator");
  assert.equal((await local.ensureAdminAccount()).id, admin.id);
  assert.equal(isAdminEmail(" NEW.OWNER@EXAMPLE.TEST "), true);
  assert.equal(isAdminEmail(DEFAULT_ADMIN_EMAIL), false);
  await assert.rejects(local.requireAdminUser(previous.id), /Only the administrator/);
  await assert.rejects(local.createUserByAdmin(previous.id, { name: "Blocked", email: "blocked@example.test" }), /Only the administrator/);
  const { user } = await local.createUserByAdmin(admin.id, { name: "Member", email: "member@example.test" });
  assert.equal(user.isAdmin, false);
  const users = await local.listUsersForAdmin(admin.id);
  assert.deepEqual(users.filter((entry) => entry.isAdmin).map((entry) => entry.id), [admin.id]);
  assert.equal(await prisma.user.count({ where: { id: previous.id } }), 1);
});

test("configuring an existing user as admin preserves their profile, password and data", async () => {
  const user = await prisma.user.create({ data: { email: "existing-admin@example.test", name: "Existing owner", jiraApiTokenCipher: "keep-this" } });
  await prisma.postIt.create({ data: { userId: user.id, text: "Keep my note" } });
  const token = await local.createPasswordSetupToken(user.email);
  await local.setPasswordWithToken(token, password);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  process.env.ADMIN_EMAIL = user.email!;
  const admin = await local.ensureAdminAccount();
  assert.equal(admin.id, user.id);
  assert.equal(admin.name, user.name);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal(after.jiraApiTokenCipher, "keep-this");
  assert.equal(await prisma.postIt.count({ where: { userId: user.id } }), 1);
  assert.equal(await prisma.user.count(), 1);
  assert.equal((await local.requireAdminUser(user.id)).id, user.id);
});

test("blank or invalid ADMIN_EMAIL settings fail without creating or granting an admin account", async () => {
  for (const value of ["", "   ", "invalid", "one@example.test,two@example.test", `${"x".repeat(255)}@example.test`]) {
    process.env.ADMIN_EMAIL = value;
    assert.throws(getAdminEmail, /ADMIN_EMAIL must be a valid email address/);
    assert.throws(() => isAdminEmail(DEFAULT_ADMIN_EMAIL), /ADMIN_EMAIL must be a valid email address/);
    await assert.rejects(local.ensureAdminAccount(), /ADMIN_EMAIL must be a valid email address/);
  }
  assert.equal(await prisma.user.count(), 0);
});
