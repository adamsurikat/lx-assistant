import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TICKET_SYNC_JQL } from "@/lib/jira";

// Lets a user view/override the JQL used by the tickets drawer's "Sync"
// button (see User.ticketSyncJql in schema.prisma). GET always resolves to
// the effective query (the user's custom one, or the built-in default);
// PUT sets a custom one, or clears it back to the default when given an
// empty string.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { ticketSyncJql: true },
  });

  return NextResponse.json({
    jql: user?.ticketSyncJql || DEFAULT_TICKET_SYNC_JQL,
    isDefault: !user?.ticketSyncJql,
    defaultJql: DEFAULT_TICKET_SYNC_JQL,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { jql?: string } | null;
  if (body === null || typeof body.jql !== "string") {
    return NextResponse.json({ error: "jql (string) is required" }, { status: 400 });
  }

  // An empty/whitespace-only value resets to the default rather than
  // storing a blank query that Jira would reject on the next sync.
  const trimmed = body.jql.trim();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { ticketSyncJql: trimmed || null },
  });

  return NextResponse.json({
    jql: trimmed || DEFAULT_TICKET_SYNC_JQL,
    isDefault: !trimmed,
    defaultJql: DEFAULT_TICKET_SYNC_JQL,
  });
}
