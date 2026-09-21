import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { HomeClient } from "@/components/HomeClient";
import type { TicketSummary } from "@/components/TicketSidebar";

// Server Component: fetches the user's cached tickets from the DB before
// the client ever renders, so the "Tickets" toggle shows its count (e.g.
// "Tickets (9)") on first paint instead of appearing after a client-side
// fetch resolves. HomeClient still refreshes/syncs from there on.
export default async function Page() {
  const session = await auth();

  let initialTickets: TicketSummary[] = [];
  if (session?.user?.id) {
    const tickets = await prisma.ticket.findMany({
      where: { userId: session.user.id, tracked: true },
      orderBy: { updatedAt: "desc" },
    });
    initialTickets = tickets.map((t) => ({
      id: t.id,
      key: t.key,
      summary: t.summary,
      status: t.status,
      color: t.color,
    }));
  }

  return <HomeClient initialTickets={initialTickets} />;
}
