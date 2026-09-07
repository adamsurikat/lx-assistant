import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  fetchGoogleCalendarEvents,
  GoogleCalendarNotConnectedError,
} from "@/lib/googleCalendar";

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

  try {
    const events = await fetchGoogleCalendarEvents(
      session.user.id,
      new Date(from),
      new Date(to)
    );
    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof GoogleCalendarNotConnectedError) {
      // Not an error state worth surfacing loudly — just means the user
      // hasn't (re)granted calendar access yet.
      return NextResponse.json({ events: [], connected: false, error: err.message });
    }
    console.error("Failed to fetch Google Calendar events", err);
    return NextResponse.json(
      { error: "Failed to fetch Google Calendar events" },
      { status: 502 }
    );
  }
}
