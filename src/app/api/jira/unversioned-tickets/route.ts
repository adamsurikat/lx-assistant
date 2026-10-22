import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchUnversionedTickets, getJiraConfigForUser, JiraNotConfiguredError, setMissingFixVersions } from "@/lib/jira";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = await getJiraConfigForUser(session.user.id);
    const tickets = await fetchUnversionedTickets(config, request.signal);
    return NextResponse.json({ tickets, siteUrl: config.siteUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof JiraNotConfiguredError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (!request.signal.aborted) console.error("Failed to load unversioned Jira tickets", error);
    return NextResponse.json({ error: "Could not load tickets. Check your Jira connection and try again." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body?.fixVersion !== "string" || !/^\d{4}\.\d{1,2}\.\d{1,2}-\d+$/.test(body.fixVersion.trim())
    || !Array.isArray(body.ticketIds) || !body.ticketIds.length
    || body.ticketIds.some((id: unknown) => typeof id !== "string" || !/^\d+$/.test(id))) {
    return NextResponse.json({ error: "A valid fix version and selected ticket IDs are required" }, { status: 400 });
  }
  try {
    const config = await getJiraConfigForUser(session.user.id);
    const result = await setMissingFixVersions(config, body.fixVersion, body.ticketIds);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof JiraNotConfiguredError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Failed to set Jira fix versions", error);
    return NextResponse.json({ error: "Could not update tickets. Refresh the list before retrying." }, { status: 502 });
  }
}
