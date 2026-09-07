import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchAssignedOpenTickets,
  getJiraConfigForUser,
  JiraNotConfiguredError,
} from "@/lib/jira";
import { TICKET_COLOR_PALETTE as PALETTE } from "@/lib/ticketColor";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ tickets });
}

// Re-fetches assigned open tickets from Jira and upserts them into the local cache.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getJiraConfigForUser(session.user.id);
    const jiraTickets = await fetchAssignedOpenTickets(config);

    const existing = await prisma.ticket.findMany({
      where: { userId: session.user.id },
      select: { jiraId: true, color: true },
    });
    const colorByJiraId = new Map(existing.map((t) => [t.jiraId, t.color]));

    let paletteIndex = existing.length;
    const results = [];
    for (const jt of jiraTickets) {
      const color =
        colorByJiraId.get(jt.id) ?? PALETTE[paletteIndex++ % PALETTE.length];
      const ticket = await prisma.ticket.upsert({
        where: { userId_jiraId: { userId: session.user.id, jiraId: jt.id } },
        create: {
          userId: session.user.id,
          jiraId: jt.id,
          key: jt.key,
          summary: jt.summary,
          status: jt.status,
          color,
        },
        update: {
          key: jt.key,
          summary: jt.summary,
          status: jt.status,
        },
      });
      results.push(ticket);
    }

    // Remove locally cached tickets that are no longer assigned/open in Jira,
    // but only ones with no time entries (keep history intact otherwise).
    const currentJiraIds = new Set(jiraTickets.map((t) => t.id));
    const stale = existing.filter((t) => !currentJiraIds.has(t.jiraId));
    if (stale.length > 0) {
      await prisma.ticket.deleteMany({
        where: {
          userId: session.user.id,
          jiraId: { in: stale.map((t) => t.jiraId) },
          timeEntries: { none: {} },
        },
      });
    }

    return NextResponse.json({ tickets: results });
  } catch (err) {
    if (err instanceof JiraNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to sync Jira tickets", err);
    return NextResponse.json(
      { error: "Failed to sync tickets from Jira" },
      { status: 502 }
    );
  }
}
