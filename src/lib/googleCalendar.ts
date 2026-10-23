import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "./crypto";
import { getGoogleCalendarConnection, hasCalendarScope, GOOGLE_TOKEN_URL } from "./googleCalendarConnection";

const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleCalendarNotConnectedError extends Error {
  constructor() {
    super(
      "Google Calendar isn't connected. Connect it in Settings to see your meetings."
    );
    this.name = "GoogleCalendarNotConnectedError";
  }
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string; // ISO timestamp
  end: string; // ISO timestamp
  allDay: boolean;
  htmlLink?: string;
}

/** Calendar access is independent of the app's email/password sign-in. */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const connection = await getGoogleCalendarConnection(userId);
  return Boolean(connection && hasCalendarScope(connection.scope));
}

async function getValidGoogleAccessToken(userId: string): Promise<{ token: string; googleAccountId: string }> {
  const connection = await getGoogleCalendarConnection(userId);
  if (!connection || !hasCalendarScope(connection.scope)) throw new GoogleCalendarNotConnectedError();
  const googleAccountId = connection.googleAccountId;
  if (connection.expiresAt.getTime() > Date.now() + 60_000) {
    return { token: decryptSecret(connection.accessTokenCipher), googleAccountId };
  }
  if (!connection.refreshTokenCipher) throw new GoogleCalendarNotConnectedError();
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Calendar is not configured on this server.");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      grant_type: "refresh_token", refresh_token: decryptSecret(connection.refreshTokenCipher),
    }),
  });
  if (!response.ok) throw new GoogleCalendarNotConnectedError();
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!data.access_token || !Number.isFinite(data.expires_in)) throw new GoogleCalendarNotConnectedError();
  const updated = await prisma.googleCalendarConnection.updateMany({
    where: { userId, accessTokenCipher: connection.accessTokenCipher },
    data: {
      accessTokenCipher: encryptSecret(data.access_token), expiresAt: new Date(Date.now() + data.expires_in * 1000),
      ...(data.refresh_token ? { refreshTokenCipher: encryptSecret(data.refresh_token) } : {}),
    },
  });
  // A disconnect or reconnect during refresh must not restore the old grant.
  if (!updated.count) {
    const current = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
    if (!current || current.googleAccountId !== googleAccountId) throw new GoogleCalendarNotConnectedError();
    return { token: decryptSecret(current.accessTokenCipher), googleAccountId };
  }
  return { token: data.access_token, googleAccountId };
}

/**
 * Fetches the user's primary Google Calendar events within [timeMin, timeMax)
 * directly from the Google Calendar API. Internal — callers should go
 * through `getCachedGoogleCalendarEvents`/`syncGoogleCalendarEvents` instead
 * so the DB cache stays the source of truth for the UI.
 */
async function fetchGoogleCalendarEventsFromApi(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ events: GoogleCalendarEvent[]; googleAccountId: string }> {
  const { token: accessToken, googleAccountId } = await getValidGoogleAccessToken(userId);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch Google Calendar events (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    items: Array<{
      id: string;
      summary?: string;
      status?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  const events = (data.items ?? [])
    .filter((item) => item.status !== "cancelled" && item.start && item.end)
    .map((item) => {
      const allDay = !item.start!.dateTime;
      return {
        id: item.id,
        title: item.summary || "(No title)",
        start: (item.start!.dateTime ?? item.start!.date)!,
        end: (item.end!.dateTime ?? item.end!.date)!,
        allDay,
        htmlLink: item.htmlLink,
      };
    });
  return { events, googleAccountId };
}

/**
 * Reads the user's Google Calendar events for [timeMin, timeMax) from the
 * local DB cache — no live Google API call. This is the primary path the
 * calendar UI reads from; use `syncGoogleCalendarEvents` to refresh it.
 * Matches events that overlap the window at all (same semantics as
 * Google's own timeMin/timeMax), not just ones fully contained in it.
 */
export async function getCachedGoogleCalendarEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<GoogleCalendarEvent[]> {
  const rows = await prisma.googleCalendarEvent.findMany({
    where: { userId, start: { lt: timeMax }, end: { gt: timeMin } },
    orderBy: { start: "asc" },
  });
  return rows.map((row) => ({
    id: row.googleEventId,
    title: row.title,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    allDay: row.allDay,
    htmlLink: row.htmlLink ?? undefined,
  }));
}

/**
 * Fetches events from the live Google Calendar API for [timeMin, timeMax)
 * and upserts them into the local DB cache, removing any previously-cached
 * events in that same window that are no longer returned (e.g. deleted or
 * moved out of range). Called as a background refresh, not on the UI's
 * critical path — see /api/google-calendar/events's POST handler.
 */
export async function syncGoogleCalendarEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<void> {
  const { events, googleAccountId } = await fetchGoogleCalendarEventsFromApi(userId, timeMin, timeMax);

  await prisma.$transaction(async (tx) => {
    const connection = await tx.googleCalendarConnection.findUnique({ where: { userId } });
    if (!connection || connection.googleAccountId !== googleAccountId) return;

    for (const event of events) {
      await tx.googleCalendarEvent.upsert({
        where: { userId_googleEventId: { userId, googleEventId: event.id } },
        create: {
          userId,
          googleEventId: event.id,
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          allDay: event.allDay,
          htmlLink: event.htmlLink,
        },
        update: {
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          allDay: event.allDay,
          htmlLink: event.htmlLink,
        },
      });
    }

    const currentIds = new Set(events.map((e) => e.id));
    const cachedInWindow = await tx.googleCalendarEvent.findMany({
      where: { userId, start: { lt: timeMax }, end: { gt: timeMin } },
      select: { id: true, googleEventId: true },
    });
    const staleIds = cachedInWindow
      .filter((row) => !currentIds.has(row.googleEventId))
      .map((row) => row.id);
    if (staleIds.length > 0) {
      await tx.googleCalendarEvent.deleteMany({ where: { id: { in: staleIds } } });
    }
  });
}
