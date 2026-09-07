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
 * Looks up any Jira ticket by key/id (not limited to tickets assigned to the
 * user or in an open status) and adds it to the local cache, so it can be
 * used even if it wasn't picked up by the regular "assigned to me" sync.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { key?: string };
  const key = body.key?.trim();
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

    const existing = await prisma.ticket.findUnique({
      where: { userId_jiraId: { userId: session.user.id, jiraId: jiraTicket.id } },
      select: { color: true },
    });

    const ticket = await prisma.ticket.upsert({
      where: { userId_jiraId: { userId: session.user.id, jiraId: jiraTicket.id } },
      create: {
        userId: session.user.id,
        jiraId: jiraTicket.id,
        key: jiraTicket.key,
        summary: jiraTicket.summary,
        status: jiraTicket.status,
        color: existing?.color ?? colorForTicketKey(jiraTicket.key),
        // Not added to the tracked sidebar list — only attached to whichever
        // single time entry the user assigns it to from this search box.
        tracked: false,
      },
      update: {
        key: jiraTicket.key,
        summary: jiraTicket.summary,
        status: jiraTicket.status,
      },
    });

    return NextResponse.json({ ticket });
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
