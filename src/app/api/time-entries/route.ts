import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createWorklog, getJiraConfigForUser, JiraNotConfiguredError } from "@/lib/jira";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.user.id,
      ...(from && to
        ? { start: { gte: new Date(from) }, end: { lte: new Date(to) } }
        : {}),
    },
    include: { ticket: true },
    orderBy: { start: "asc" },
  });

  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    ticketId?: string;
    start?: string;
    end?: string;
    comment?: string;
  };

  if (!body.start || !body.end) {
    return NextResponse.json(
      { error: "start and end are required" },
      { status: 400 }
    );
  }

  let ticketId: string | null = null;
  if (body.ticketId) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: body.ticketId, userId: session.user.id },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    ticketId = ticket.id;
  }

  const start = new Date(body.start);
  const end = new Date(body.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Invalid start/end range" }, { status: 400 });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: session.user.id,
      ticketId,
      start,
      end,
      comment: body.comment,
    },
    include: { ticket: true },
  });

  // Attempt to push the worklog to Jira immediately, but only if a ticket is
  // already assigned — "blank" entries are synced later once a ticket is set.
  const synced = ticketId ? await trySyncToJira(session.user.id, entry.id) : null;

  return NextResponse.json({ entry: synced ?? entry });
}

/**
 * Creates the corresponding Jira worklog for a time entry and marks it synced.
 * Failures are recorded on the entry (lastSyncError) rather than thrown, so the
 * local entry is never lost if Jira is unreachable.
 */
export async function trySyncToJira(userId: string, timeEntryId: string) {
  const entry = await prisma.timeEntry.findFirst({
    where: { id: timeEntryId, userId },
    include: { ticket: true },
  });
  if (!entry || !entry.ticket) return entry;

  try {
    const config = await getJiraConfigForUser(userId);
    const timeSpentSeconds = Math.round(
      (entry.end.getTime() - entry.start.getTime()) / 1000
    );
    const { id: worklogId } = await createWorklog(config, {
      issueIdOrKey: entry.ticket.jiraId,
      startedISO: entry.start.toISOString(),
      timeSpentSeconds,
      comment: entry.comment ?? undefined,
    });

    return await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        syncedToJira: true,
        jiraWorklogId: worklogId,
        lastSyncError: null,
        lastSyncedAt: new Date(),
      },
      include: { ticket: true },
    });
  } catch (err) {
    const message =
      err instanceof JiraNotConfiguredError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error syncing to Jira";
    return await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { lastSyncError: message },
      include: { ticket: true },
    });
  }
}
