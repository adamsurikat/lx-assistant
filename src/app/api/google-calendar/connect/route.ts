import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authErrorResponse, requireSameOrigin, requestOrigin } from "@/lib/authRequest";
import { beginGoogleCalendarConnection, disconnectGoogleCalendar, GOOGLE_STATE_COOKIE } from "@/lib/googleCalendarConnection";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requireSameOrigin(request);
    const origin = requestOrigin(request);
    const { state, url } = await beginGoogleCalendarConnection(session.user.id, origin);
    const response = NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(GOOGLE_STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", maxAge: 600, path: "/" });
    return response;
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requireSameOrigin(request);
    await disconnectGoogleCalendar(session.user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(GOOGLE_STATE_COOKIE);
    return response;
  } catch (error) { return authErrorResponse(error); }
}
