import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
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

/**
 * Whether the user has granted the Calendar readonly scope (via the
 * separate "Connect Google Calendar" flow in Settings) — distinct from
 * simply being signed in with Google, which only grants basic profile
 * info. Used to decide whether to fetch/show events for this user at all.
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true, access_token: true },
  });
  return Boolean(account?.access_token && account.scope?.includes("calendar"));
}

/**
 * Returns a valid Google OAuth access token for the user's linked Google
 * account, refreshing it via the stored refresh_token if it has expired.
 */
async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account || !account.access_token) {
    throw new GoogleCalendarNotConnectedError();
  }

  const expiresAt = account.expires_at ?? 0;
  const isExpired = expiresAt * 1000 < Date.now() + 60_000; // refresh 1 min early
  if (!isExpired) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new GoogleCalendarNotConnectedError();
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are not configured");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to refresh Google access token: ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  const newExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  await prisma.account.update({
    where: { id: account.id },
    data: { access_token: data.access_token, expires_at: newExpiresAt },
  });

  return data.access_token;
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
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidGoogleAccessToken(userId);

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

  return (data.items ?? [])
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
  const events = await fetchGoogleCalendarEventsFromApi(userId, timeMin, timeMax);

  for (const event of events) {
    await prisma.googleCalendarEvent.upsert({
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
  const cachedInWindow = await prisma.googleCalendarEvent.findMany({
    where: { userId, start: { lt: timeMax }, end: { gt: timeMin } },
    select: { id: true, googleEventId: true },
  });
  const staleIds = cachedInWindow
    .filter((row) => !currentIds.has(row.googleEventId))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await prisma.googleCalendarEvent.deleteMany({ where: { id: { in: staleIds } } });
  }
}
