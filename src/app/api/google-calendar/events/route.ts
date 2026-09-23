import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getCachedGoogleCalendarEvents,
  syncGoogleCalendarEvents,
  GoogleCalendarNotConnectedError,
} from "@/lib/googleCalendar";

// Reads Google Calendar events from the local DB cache — no live Google API
// call. This is the primary/fast path the calendar UI reads from on every
// load; see POST below for the background sync that keeps it fresh.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const events = await getCachedGoogleCalendarEvents(
    session.user.id,
    new Date(from),
    new Date(to)
  );
  return NextResponse.json({ events });
}

// Re-fetches events from the live Google Calendar API for the given window
// and upserts them into the local DB cache. Called in the background on
// page load (see HomeClient) so the DB stays up to date without blocking
// the UI's initial (cached) render.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  try {
    await syncGoogleCalendarEvents(session.user.id, new Date(from), new Date(to));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GoogleCalendarNotConnectedError) {
      // Not an error state worth surfacing loudly — just means the user
      // hasn't (re)granted calendar access yet.
      return NextResponse.json({ ok: false, connected: false, error: err.message });
    }
    console.error("Failed to sync Google Calendar events", err);
    return NextResponse.json(
      { error: "Failed to sync Google Calendar events" },
      { status: 502 }
    );
  }
}
