import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";

let directory: string;
let prisma: PrismaClient;
let google: typeof import("./googleCalendarConnection");
let crypto: typeof import("./crypto");
let calendar: typeof import("./googleCalendar");
const keys = ['DATABASE_URL', 'TOKEN_ENCRYPTION_KEY', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const origin = 'http://localhost:3456';

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'lx-google-connection-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.AUTH_GOOGLE_ID = 'test-client';
  process.env.AUTH_GOOGLE_SECRET = 'test-secret';
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
  prisma = (await import('./prisma')).prisma;
  google = await import('./googleCalendarConnection');
  crypto = await import('./crypto');
  calendar = await import('./googleCalendar');
});
beforeEach(async () => { await prisma.user.deleteMany(); });
after(async () => {
  await prisma?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
  for (const key of keys) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; }
});

async function user(email = 'app@example.test') { return prisma.user.create({ data: { email, passwordHash: 'existing-password-hash' } }); }
async function event(userId: string) {
  return prisma.googleCalendarEvent.create({ data: { userId, googleEventId: 'old', title: 'Cached meeting', start: new Date('2026-10-20'), end: new Date('2026-10-21'), allDay: true } });
}
function mockGoogle(t: TestContext, subject = 'google-account', scope?: string) {
  return t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === google.GOOGLE_TOKEN_URL) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.ok(body.get('code_verifier'));
      assert.equal(body.get('redirect_uri'), origin + google.GOOGLE_CALLBACK_PATH);
      return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, scope: scope ?? google.GOOGLE_CALENDAR_SCOPE });
    }
    assert.equal(String(input), 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer new-access');
    return Response.json({ sub: subject, email: 'different@example.test' });
  });
}

test('legacy Calendar grants migrate encrypted without changing the user or cached events', async () => {
  const current = await user();
  await event(current.id);
  const old = await prisma.account.create({ data: { userId: current.id, type: 'oauth', provider: 'google', providerAccountId: 'old-google', access_token: 'legacy-access', refresh_token: 'legacy-refresh', id_token: 'old-id-token', scope: google.GOOGLE_CALENDAR_SCOPE, expires_at: Math.floor(Date.now()/1000)+3600 } });
  const connection = await google.getGoogleCalendarConnection(current.id);
  assert.equal(connection?.googleAccountId, 'old-google');
  assert.equal(crypto.decryptSecret(connection!.accessTokenCipher), 'legacy-access');
  assert.equal(crypto.decryptSecret(connection!.refreshTokenCipher!), 'legacy-refresh');
  const legacy = await prisma.account.findUniqueOrThrow({ where: { id: old.id } });
  assert.equal(legacy.access_token, null); assert.equal(legacy.refresh_token, null); assert.equal(legacy.id_token, null);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: current.id } })).passwordHash, 'existing-password-hash');
  assert.equal(await prisma.googleCalendarEvent.count(), 1);
  assert.equal((await google.getGoogleCalendarConnection(current.id))?.googleAccountId, 'old-google');
});

test('profile-only Google accounts do not count as connected calendars', async () => {
  const current = await user();
  await prisma.account.create({ data: { userId: current.id, type: 'oauth', provider: 'google', providerAccountId: 'profile-only', access_token: 'profile-token', scope: 'openid email profile' } });
  assert.equal(await calendar.isGoogleCalendarConnected(current.id), false);
});

test('Calendar connection uses offline consent, PKCE and the registered callback, and attaches only to the app user', async (t) => {
  const current = await user();
  const other = await user('different@example.test');
  const flow = await google.beginGoogleCalendarConnection(current.id, origin);
  const params = new URL(flow.url).searchParams;
  assert.equal(params.get('access_type'), 'offline');
  assert.equal(params.get('prompt'), 'consent');
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.ok(params.get('scope')?.includes(google.GOOGLE_CALENDAR_SCOPE));
  assert.equal(params.get('redirect_uri'), origin + google.GOOGLE_CALLBACK_PATH);
  const saved = await prisma.googleCalendarOAuthState.findFirstOrThrow();
  assert.notEqual(saved.stateHash, flow.state);
  const fetch = mockGoogle(t);
  await google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: flow.state, code: 'test-code' }), flow.state, origin);
  const connected = await prisma.googleCalendarConnection.findUniqueOrThrow({ where: { userId: current.id } });
  assert.equal(connected.email, 'different@example.test');
  assert.notEqual(connected.accessTokenCipher, 'new-access');
  assert.equal(await prisma.googleCalendarConnection.findUnique({ where: { userId: other.id } }), null);
  assert.equal(await prisma.user.count(), 2);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: current.id } })).email, 'app@example.test');
  assert.equal(await prisma.googleCalendarOAuthState.count(), 0);
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: flow.state, code: 'test-code' }), flow.state, origin), /expired/);
  assert.equal(fetch.mock.callCount(), 2);
});

test('wrong cookie, user, origin and expired state never exchange a code', async (t) => {
  const current = await user();
  const other = await user('other@example.test');
  const flow = await google.beginGoogleCalendarConnection(current.id, origin);
  const params = new URLSearchParams({ state: flow.state, code: 'test-code' });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No exchange allowed'); });
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, params, undefined, origin), /expired/);
  await assert.rejects(google.completeGoogleCalendarConnection(other.id, params, flow.state, origin), /expired/);
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, params, flow.state, 'https://other.example.test'), /expired/);
  await prisma.googleCalendarOAuthState.updateMany({ data: { expiresAt: new Date(Date.now()-1) } });
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, params, flow.state, origin), /expired/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('cancellation and missing Calendar permission leave the account unconnected', async (t) => {
  const current = await user();
  const flow = await google.beginGoogleCalendarConnection(current.id, origin);
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: flow.state, error: 'access_denied' }), flow.state, origin), /cancelled/);
  assert.equal(await prisma.googleCalendarOAuthState.count(), 0);
  const retry = await google.beginGoogleCalendarConnection(current.id, origin);
  mockGoogle(t, 'google-account', 'openid email');
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: retry.state, code: 'code' }), retry.state, origin), /permission was not granted/);
  assert.equal(await prisma.googleCalendarConnection.count(), 0);
});

test('switching Google accounts clears only that user’s cached meetings; disconnect keeps app data', async (t) => {
  const current = await user();
  const other = await user('other@example.test');
  const first = await google.beginGoogleCalendarConnection(current.id, origin);
  const mock = mockGoogle(t, 'first-google');
  await google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: first.state, code: 'first' }), first.state, origin);
  await event(current.id); await event(other.id);
  await prisma.postIt.create({ data: { userId: current.id, text: 'Keep me' } });
  mock.mock.restore(); mockGoogle(t, 'second-google');
  const second = await google.beginGoogleCalendarConnection(current.id, origin);
  await google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: second.state, code: 'second' }), second.state, origin);
  assert.equal(await prisma.googleCalendarEvent.count({ where: { userId: current.id } }), 0);
  assert.equal(await prisma.googleCalendarEvent.count({ where: { userId: other.id } }), 1);
  await event(current.id);
  const pending = await google.beginGoogleCalendarConnection(current.id, origin);
  await google.disconnectGoogleCalendar(current.id);
  assert.equal(await calendar.isGoogleCalendarConnected(current.id), false);
  assert.equal(await prisma.googleCalendarEvent.count({ where: { userId: current.id } }), 0);
  assert.equal(await prisma.postIt.count({ where: { userId: current.id } }), 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: current.id } })).passwordHash, 'existing-password-hash');
  await assert.rejects(google.completeGoogleCalendarConnection(current.id, new URLSearchParams({ state: pending.state, code: 'pending' }), pending.state, origin), /expired/);
});

test('Calendar token refresh reads encrypted credentials and does not restore a disconnected grant', async (t) => {
  const current = await user();
  await prisma.googleCalendarConnection.create({ data: { userId: current.id, googleAccountId: 'google-account', accessTokenCipher: crypto.encryptSecret('old-access'), refreshTokenCipher: crypto.encryptSecret('refresh-secret'), expiresAt: new Date(0), scope: google.GOOGLE_CALENDAR_SCOPE } });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), google.GOOGLE_TOKEN_URL);
    assert.equal((init?.body as URLSearchParams).get('refresh_token'), 'refresh-secret');
    await google.disconnectGoogleCalendar(current.id);
    return Response.json({ access_token: 'refreshed-access', expires_in: 3600 });
  });
  await assert.rejects(calendar.syncGoogleCalendarEvents(current.id, new Date('2026-10-20'), new Date('2026-10-21')), /isn't connected/);
  assert.equal(await prisma.googleCalendarConnection.count(), 0);
  assert.equal(await prisma.googleCalendarEvent.count(), 0);
});

test('connected Calendar refreshes and caches events using its independent encrypted grant', async (t) => {
  const current = await user();
  await event(current.id);
  await prisma.googleCalendarConnection.create({ data: { userId: current.id, googleAccountId: 'google-account', accessTokenCipher: crypto.encryptSecret('old-access'), refreshTokenCipher: crypto.encryptSecret('refresh-secret'), expiresAt: new Date(0), scope: google.GOOGLE_CALENDAR_SCOPE } });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === google.GOOGLE_TOKEN_URL) return Response.json({ access_token: 'refreshed-access', refresh_token: 'rotated-refresh', expires_in: 3600 });
    assert.ok(String(input).startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?'));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer refreshed-access');
    return Response.json({ items: [{ id: 'new', summary: 'New meeting', start: { dateTime: '2026-10-20T10:00:00Z' }, end: { dateTime: '2026-10-20T11:00:00Z' } }] });
  });
  await calendar.syncGoogleCalendarEvents(current.id, new Date('2026-10-20'), new Date('2026-10-21'));
  const events = await calendar.getCachedGoogleCalendarEvents(current.id, new Date('2026-10-20'), new Date('2026-10-21'));
  assert.deepEqual(events.map(event => event.id), ['new']);
  const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({ where: { userId: current.id } });
  assert.equal(crypto.decryptSecret(connection.accessTokenCipher), 'refreshed-access');
  assert.equal(crypto.decryptSecret(connection.refreshTokenCipher!), 'rotated-refresh');
});
