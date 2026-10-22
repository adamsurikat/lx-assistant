import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { JiraNotConfiguredError } from "@/lib/jira";
import { getCachedJiraFixVersions, refreshJiraFixVersions } from "@/lib/jiraFixVersionCache";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const versions = await getCachedJiraFixVersions(session.user.id);
  return NextResponse.json({ versions }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const versions = await refreshJiraFixVersions(session.user.id);
    return NextResponse.json({ versions }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof JiraNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to refresh Jira fix versions", err);
    return NextResponse.json(
      { error: "Could not load fix versions from Jira. Please try again." },
      { status: 502 }
    );
  }
}
