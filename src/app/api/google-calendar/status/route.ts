import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isGoogleCalendarConnected } from "@/lib/googleCalendar";

// Lets the client know whether Google Calendar access has actually been
// granted (separate from just being logged in with Google — see the
// "Connect Google Calendar" flow in Settings) so it knows whether to show
// the disabled placeholder in the calendar's Google column.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connected = await isGoogleCalendarConnected(session.user.id);
  return NextResponse.json({ connected });
}
