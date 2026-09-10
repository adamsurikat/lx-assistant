import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchTicketByKey,
  getJiraConfigForUser,
  JiraNotConfiguredError,
} from "@/lib/jira";
import { colorForTicketKey } from "@/lib/ticketColor";

/**
 * Looks up a single Jira ticket by key (e.g. "PROJ-123") for the post-it
 * board's ticket-reference popover — used whenever a note's text looks like
 * a Jira key, so we can show a quick summary + link without leaving the
 * board. Also upserts the local ticket cache (same as the manual "search by
 * key" lookup) so the color/summary stay consistent across the app.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey).trim();
  if (!key) {
    return NextResponse.json({ error: "A ticket key is required" }, { status: 400 });
  }

  try {
    const config = await getJiraConfigForUser(session.user.id);
    const jiraTicket = await fetchTicketByKey(config, key);
    if (!jiraTicket) {
      return NextResponse.json(
        { error: `No Jira ticket found for "${key}"` },
        { status: 404 }
      );
    }

    const ticket = await prisma.ticket.upsert({
      where: { userId_jiraId: { userId: session.user.id, jiraId: jiraTicket.id } },
      create: {
        userId: session.user.id,
        jiraId: jiraTicket.id,
        key: jiraTicket.key,
        summary: jiraTicket.summary,
        status: jiraTicket.status,
        color: colorForTicketKey(jiraTicket.key),
        tracked: false,
      },
      update: {
        key: jiraTicket.key,
        summary: jiraTicket.summary,
        status: jiraTicket.status,
        color: colorForTicketKey(jiraTicket.key),
      },
    });

    const browseUrl = `${config.siteUrl.replace(/\/$/, "")}/browse/${ticket.key}`;

    return NextResponse.json({ ticket, browseUrl });
  } catch (err) {
    if (err instanceof JiraNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to look up Jira ticket", err);
    return NextResponse.json(
      { error: "Failed to look up ticket from Jira" },
      { status: 502 }
    );
  }
}
