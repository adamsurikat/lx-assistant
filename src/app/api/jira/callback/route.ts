import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCodeForToken, fetchAccessibleResources } from "@/lib/atlassian-oauth";
import { STATE_COOKIE } from "@/app/api/jira/connect/route";

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams, origin } = new URL(request.url);
  const settingsUrl = new URL("/settings", origin);

  if (!session?.user?.id) {
    settingsUrl.searchParams.set("jira_error", "unauthorized");
    return NextResponse.redirect(settingsUrl);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (error) {
    settingsUrl.searchParams.set("jira_error", error);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("jira_error", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const redirectUri = new URL("/api/jira/callback", origin).toString();
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const resources = await fetchAccessibleResources(tokens.access_token);

    if (resources.length === 0) {
      settingsUrl.searchParams.set("jira_error", "no_sites");
      return NextResponse.redirect(settingsUrl);
    }

    // Users with access to multiple Jira sites are uncommon for this app's
    // use case; connect the first accessible site.
    const site = resources[0];
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.jiraConnection.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        cloudId: site.id,
        siteUrl: site.url,
        accessTokenCipher: encryptSecret(tokens.access_token),
        refreshTokenCipher: encryptSecret(tokens.refresh_token),
        expiresAt,
      },
      update: {
        cloudId: site.id,
        siteUrl: site.url,
        accessTokenCipher: encryptSecret(tokens.access_token),
        refreshTokenCipher: encryptSecret(tokens.refresh_token),
        expiresAt,
      },
    });

    // Connecting via OAuth supersedes any manually-entered API token (a
    // user only has one active Jira connection method at a time).
    await prisma.user.update({
      where: { id: session.user.id },
      data: { jiraEmail: null, jiraSiteUrl: null, jiraApiTokenCipher: null },
    });

    settingsUrl.searchParams.set("jira_connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("Jira OAuth callback failed", err);
    settingsUrl.searchParams.set("jira_error", "connection_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
