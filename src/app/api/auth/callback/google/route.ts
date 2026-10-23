import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requestOrigin } from "@/lib/authRequest";
import { AuthInputError } from "@/lib/localAuth";
import { completeGoogleCalendarConnection, GOOGLE_STATE_COOKIE } from "@/lib/googleCalendarConnection";

// Keep the registered Google redirect URI; this endpoint connects Calendar only.
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const session = await auth();
  const target = new URL(session?.user?.id ? "/settings" : "/login", origin);
  const state = (await cookies()).get(GOOGLE_STATE_COOKIE)?.value;
  if (session?.user?.id) {
    try {
      await completeGoogleCalendarConnection(session.user.id, new URL(request.url).searchParams, state, origin);
      target.searchParams.set("google_connected", "1");
    } catch (error) {
      target.searchParams.set("google_error", error instanceof AuthInputError ? error.message : "Could not connect Google Calendar. Please try again.");
    }
  }
  const response = NextResponse.redirect(target);
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}
