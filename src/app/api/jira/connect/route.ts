import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { auth } from "@/auth";
import { buildAuthorizeUrl } from "@/lib/atlassian-oauth";

export const STATE_COOKIE = "jira_oauth_state";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.JIRA_OAUTH_CLIENT_ID || !process.env.JIRA_OAUTH_CLIENT_SECRET) {
    const settingsUrl = new URL("/settings", request.url);
    settingsUrl.searchParams.set("jira_error", "oauth_not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes to complete the OAuth round trip
    path: "/",
  });

  const redirectUri = new URL("/api/jira/callback", request.url).toString();
  const authorizeUrl = buildAuthorizeUrl(state, redirectUri);

  return NextResponse.redirect(authorizeUrl);
}
