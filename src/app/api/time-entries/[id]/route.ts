import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createWorklog,
  deleteWorklog,
  getJiraConfigForUser,
  JiraNotConfiguredError,
  updateWorklog,
} from "@/lib/jira";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const body = (await request.json()) as {
    start?: string;
    end?: string;
    comment?: string;
  };

  const existing = await prisma.timeEntry.findFirst({
    where: { id, userId: session.user.id },
    include: { ticket: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const start = body.start ? new Date(body.start) : existing.start;
  const end = body.end ? new Date(body.end) : existing.end;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Invalid start/end range" }, { status: 400 });
  }

  let entry = await prisma.timeEntry.update({
    where: { id },
    data: {
      start,
      end,
      ...(body.comment !== undefined ? { comment: body.comment } : {}),
    },
    include: { ticket: true },
  });

  // Push the move/resize to the existing Jira worklog, or create one if it
  // was never successfully synced before.
  try {
    const config = await getJiraConfigForUser(session.user.id);
    const timeSpentSeconds = Math.round(
      (entry.end.getTime() - entry.start.getTime()) / 1000
    );

    if (entry.syncedToJira && entry.jiraWorklogId) {
      await updateWorklog(config, entry.ticket.jiraId, entry.jiraWorklogId, {
        startedISO: entry.start.toISOString(),
        timeSpentSeconds,
      });
      entry = await prisma.timeEntry.update({
        where: { id },
        data: { lastSyncError: null, lastSyncedAt: new Date() },
        include: { ticket: true },
      });
    } else {
      const { id: worklogId } = await createWorklog(config, {
        issueIdOrKey: entry.ticket.jiraId,
        startedISO: entry.start.toISOString(),
        timeSpentSeconds,
        comment: entry.comment ?? undefined,
      });
      entry = await prisma.timeEntry.update({
        where: { id },
        data: {
          syncedToJira: true,
          jiraWorklogId: worklogId,
          lastSyncError: null,
          lastSyncedAt: new Date(),
        },
        include: { ticket: true },
      });
    }
  } catch (err) {
    const message =
      err instanceof JiraNotConfiguredError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error syncing to Jira";
    entry = await prisma.timeEntry.update({
      where: { id },
      data: { lastSyncError: message },
      include: { ticket: true },
    });
  }

  return NextResponse.json({ entry });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.timeEntry.findFirst({
    where: { id, userId: session.user.id },
    include: { ticket: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.syncedToJira && existing.jiraWorklogId) {
    try {
      const config = await getJiraConfigForUser(session.user.id);
      await deleteWorklog(config, existing.ticket.jiraId, existing.jiraWorklogId);
    } catch (err) {
      console.error("Failed to delete Jira worklog", err);
      // Continue deleting the local entry regardless; it's the user's local
      // record and Jira cleanup can be retried manually if needed.
    }
  }

  await prisma.timeEntry.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
