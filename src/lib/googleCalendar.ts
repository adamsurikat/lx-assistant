import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleCalendarNotConnectedError extends Error {
  constructor() {
    super(
      "Google Calendar isn't connected. Sign out and sign back in, granting calendar access, to see your meetings."
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
 * for display as a read-only overlay on the app's calendar.
 */
export async function fetchGoogleCalendarEvents(
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
