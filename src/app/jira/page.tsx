import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/AppHeader";

export default async function JiraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [tickets, user, connection] = await Promise.all([
    prisma.ticket.findMany({
      where: { userId: session.user.id, tracked: true },
      select: { id: true, key: true, summary: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { jiraSiteUrl: true },
    }),
    prisma.jiraConnection.findUnique({
      where: { userId: session.user.id },
      select: { siteUrl: true },
    }),
  ]);
  const jiraSiteUrl = connection?.siteUrl ?? user?.jiraSiteUrl;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="jira" />
      <main className="nb-panel-sm m-3 flex-1 bg-nb-paper p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="nb-display text-2xl">Jira</h2>
            <p className="mt-1 text-sm text-nb-ink/60">Tracked tickets from your calendar query.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {jiraSiteUrl && (
              <a href={jiraSiteUrl} target="_blank" rel="noreferrer" className="nb-btn nb-btn-orange px-4 py-2 text-sm">
                Open Jira ↗
              </a>
            )}
            <Link href="/settings" className="nb-btn px-4 py-2 text-sm">
              {jiraSiteUrl ? "Connection settings" : "Connect Jira"}
            </Link>
          </div>
        </div>

        {tickets.length > 0 ? (
          <ul className="nb-panel-sm divide-y divide-nb-ink/10 bg-white">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 break-words">
                  {jiraSiteUrl ? (
                    <a
                      href={`${jiraSiteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(ticket.key)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-nb-ink hover:underline"
                    >
                      {ticket.key} ↗
                    </a>
                  ) : (
                    <span className="font-bold text-nb-ink">{ticket.key}</span>
                  )}
                  <p className="mt-1 text-sm text-nb-ink/80">{ticket.summary}</p>
                </div>
                <span className="nb-badge">{ticket.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nb-panel-sm bg-white p-6 text-sm text-nb-ink/60">
            {jiraSiteUrl ? "No tracked tickets yet. Sync tickets from the calendar to see them here." : "Connect Jira in Settings to see your tickets here."}
          </p>
        )}
      </main>
    </div>
  );
}
