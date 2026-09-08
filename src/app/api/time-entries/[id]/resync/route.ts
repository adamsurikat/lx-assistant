import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createWorklog,
  deleteWorklog,
  getJiraConfigForUser,
  JiraNotConfiguredError,
} from "@/lib/jira";

/**
 * Force-resyncs a time entry's Jira worklog: deletes the existing worklog
 * (if any) and then creates a brand new one, back to back. Useful when the
 * worklog on the Jira side has drifted or was edited manually and the user
 * wants a clean resync instead of an incremental update.
 */
export async function POST(
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
  if (!existing.ticket) {
    return NextResponse.json(
      { error: "Entry has no ticket assigned to sync." },
      { status: 400 }
    );
  }

  try {
    const config = await getJiraConfigForUser(session.user.id);

    if (existing.syncedToJira && existing.jiraWorklogId) {
      await deleteWorklog(config, existing.ticket.jiraId, existing.jiraWorklogId);
    }

    const timeSpentSeconds = Math.round(
      (existing.end.getTime() - existing.start.getTime()) / 1000
    );
    const { id: worklogId } = await createWorklog(config, {
      issueIdOrKey: existing.ticket.jiraId,
      startedISO: existing.start.toISOString(),
      timeSpentSeconds,
      comment: existing.comment ?? undefined,
    });

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: {
        syncedToJira: true,
        jiraWorklogId: worklogId,
        lastSyncError: null,
        lastSyncedAt: new Date(),
      },
      include: { ticket: true },
    });

    return NextResponse.json({ entry });
  } catch (err) {
    const message =
      err instanceof JiraNotConfiguredError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error resyncing to Jira";
    const entry = await prisma.timeEntry.update({
      where: { id },
      data: { lastSyncError: message },
      include: { ticket: true },
    });
    return NextResponse.json({ entry }, { status: 502 });
  }
}
