import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchJiraFixVersions, getJiraConfigForUser, JiraNotConfiguredError } from "@/lib/jira";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getJiraConfigForUser(session.user.id);
    const versions = await fetchJiraFixVersions(config, request.signal);
    return NextResponse.json({ versions }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof JiraNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (!request.signal.aborted) console.error("Failed to load Jira fix versions", err);
    return NextResponse.json(
      { error: "Could not load fix versions from Jira. Please try again." },
      { status: 502 }
    );
  }
}
