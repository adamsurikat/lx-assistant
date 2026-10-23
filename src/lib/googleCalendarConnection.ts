import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./crypto";
import { AuthInputError, tokenHash } from "./localAuth";

export const GOOGLE_STATE_COOKIE = "google_calendar_state";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleCalendarAvailable() {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.TOKEN_ENCRYPTION_KEY);
}

export function hasCalendarScope(scope: string | null | undefined) {
  return (scope ?? "").split(/\s+/).some((value) => [GOOGLE_CALENDAR_SCOPE, "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events.readonly"].includes(value));
}

// Preserve existing Calendar grants while moving them out of the former sign-in account.
export async function getGoogleCalendarConnection(userId: string) {
  const current = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (current) return current;
  return prisma.$transaction(async (tx) => {
    const old = await tx.account.findFirst({ where: { userId, provider: "google" }, include: { user: { select: { email: true } } } });
    if (!old?.access_token || !hasCalendarScope(old.scope)) return null;
    const connection = await tx.googleCalendarConnection.upsert({
      where: { userId }, update: {},
      create: {
        userId, googleAccountId: old.providerAccountId, email: old.user.email,
        accessTokenCipher: encryptSecret(old.access_token),
        refreshTokenCipher: old.refresh_token ? encryptSecret(old.refresh_token) : null,
        expiresAt: new Date((old.expires_at ?? 0) * 1000), scope: old.scope!,
      },
    });
    await tx.account.update({ where: { id: old.id }, data: { access_token: null, refresh_token: null, id_token: null } });
    return connection;
  });
}

export async function beginGoogleCalendarConnection(userId: string, origin: string) {
  if (!googleCalendarAvailable()) throw new AuthInputError("Google Calendar isn't configured on this server.", 409);
  const url = new URL(origin);
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!localhost && (url.protocol !== "https:" || isIP(url.hostname.replace(/^\[|\]$/g, "")))) {
    throw new AuthInputError("To connect Google Calendar, open the app using localhost or an HTTPS domain.");
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const redirectUri = new URL(GOOGLE_CALLBACK_PATH, origin).toString();
  const data = { stateHash: tokenHash(state), verifierCipher: encryptSecret(verifier), redirectUri, expiresAt: new Date(Date.now() + 10 * 60_000) };
  await prisma.googleCalendarOAuthState.upsert({ where: { userId }, create: { ...data, userId }, update: data });
  const params = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!, redirect_uri: redirectUri,
    response_type: "code", scope: `openid email ${GOOGLE_CALENDAR_SCOPE}`,
    access_type: "offline", prompt: "consent", state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  });
  return { state, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

export async function completeGoogleCalendarConnection(userId: string, params: URLSearchParams, cookieState: string | undefined, origin: string) {
  const state = params.get("state") ?? "";
  if (!cookieState || !/^[A-Za-z0-9_-]{43}$/.test(state) || state.length !== cookieState.length
    || !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) throw new AuthInputError("The connection attempt expired. Try again.");
  const key = tokenHash(state);
  const flow = await prisma.googleCalendarOAuthState.findUnique({ where: { stateHash: key } });
  if (!flow || flow.userId !== userId || flow.expiresAt.getTime() <= Date.now()
    || flow.redirectUri !== new URL(GOOGLE_CALLBACK_PATH, origin).toString()) throw new AuthInputError("The connection attempt expired. Try again.");
  if (params.has("error")) {
    await prisma.googleCalendarOAuthState.deleteMany({ where: { stateHash: key, userId } });
    throw new AuthInputError("Google Calendar connection was cancelled.");
  }
  const code = params.get("code");
  if (!code || code.length > 4096) throw new AuthInputError("Google did not return an authorization code.");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "authorization_code", code, redirect_uri: flow.redirectUri,
      code_verifier: decryptSecret(flow.verifierCipher),
    }),
  });
  if (!response.ok) throw new AuthInputError("Google Calendar authorization failed. Try connecting again.", 502);
  const tokens = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in! <= 0 || !hasCalendarScope(tokens.scope)) {
    throw new AuthInputError("Google Calendar permission was not granted. Try connecting again.");
  }
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!profileResponse.ok) throw new AuthInputError("Could not verify the connected Google account.", 502);
  const profile = await profileResponse.json() as { sub?: string; email?: string };
  if (!profile.sub) throw new AuthInputError("Could not verify the connected Google account.", 502);
  // Never create/sign in a user or match by email: attach only to the initiating app session.
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.googleCalendarOAuthState.deleteMany({ where: { stateHash: key, userId, expiresAt: { gt: new Date() } } });
    if (!consumed.count) throw new AuthInputError("The connection attempt expired. Try again.");
    const previous = await tx.googleCalendarConnection.findUnique({ where: { userId } });
    const legacy = await tx.account.findFirst({ where: { userId, provider: "google" } });
    const previousId = previous?.googleAccountId ?? legacy?.providerAccountId;
    const previousRefresh = previous?.refreshTokenCipher ?? (legacy?.refresh_token ? encryptSecret(legacy.refresh_token) : null);
    const data = {
      googleAccountId: profile.sub!, email: profile.email ?? null, scope: tokens.scope!,
      accessTokenCipher: encryptSecret(tokens.access_token!),
      refreshTokenCipher: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : previousId === profile.sub ? previousRefresh : null,
      expiresAt: new Date(Date.now() + tokens.expires_in! * 1000),
    };
    await tx.googleCalendarConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    if (previousId !== profile.sub) await tx.googleCalendarEvent.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId, provider: "google" } });
  });
}

export async function disconnectGoogleCalendar(userId: string) {
  await prisma.$transaction([
    prisma.googleCalendarOAuthState.deleteMany({ where: { userId } }),
    prisma.googleCalendarConnection.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId, provider: "google" } }),
    prisma.googleCalendarEvent.deleteMany({ where: { userId } }),
  ]);
}
