import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  fetchStagingDeploymentTickets,
  getJiraConfigForUser,
  JiraNotConfiguredError,
} from "@/lib/jira";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixVersion = new URL(request.url).searchParams.get("fixVersion")?.trim();
  if (!fixVersion) {
    return NextResponse.json({ error: "An expected fix version is required" }, { status: 400 });
  }

  try {
    const config = await getJiraConfigForUser(session.user.id);
    const tickets = await fetchStagingDeploymentTickets(config, fixVersion, request.signal);
    return NextResponse.json(
      { tickets, siteUrl: config.siteUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof JiraNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (!request.signal.aborted) console.error("Failed to load staging tickets", err);
    return NextResponse.json(
      { error: "Could not load staging tickets. Check the fix version and your Jira connection." },
      { status: 502 }
    );
  }
}
