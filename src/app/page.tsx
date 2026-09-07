"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { TicketSidebar, type TicketSummary } from "@/components/TicketSidebar";
import { TimeCalendar, type CalendarEventItem } from "@/components/TimeCalendar";
import { EventEditorModal } from "@/components/EventEditorModal";

interface TimeEntryDTO {
  id: string;
  start: string;
  end: string;
  comment: string | null;
  syncedToJira: boolean;
  lastSyncError: string | null;
  ticket: TicketSummary | null;
}

function startOfWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift Sunday(0) back to previous Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [entries, setEntries] = useState<TimeEntryDTO[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const weekStart = startOfWeekMonday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 14); // load 2 weeks so week nav feels responsive

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    const res = await fetch("/api/jira/tickets");
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets);
    }
    setLoadingTickets(false);
  }, []);

  const loadEntries = useCallback(async () => {
    const params = new URLSearchParams({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    });
    const res = await fetch(`/api/time-entries?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJiraStatus = useCallback(async () => {
    const res = await fetch("/api/jira/token");
    if (res.ok) {
      const data = await res.json();
      setJiraConnected(Boolean(data.connected));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    loadTickets();
    loadEntries();
    loadJiraStatus();
  }, [loadTickets, loadEntries, loadJiraStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    const res = await fetch("/api/jira/tickets", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to sync tickets from Jira.");
    } else {
      await loadTickets();
    }
    setSyncing(false);
  };

  const handleDropTicket = async (ticketId: string, start: Date, end: Date) => {
    setError(null);
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId,
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create time entry.");
      return;
    }
    await loadEntries();
  };

  const handleCreateBlankEvent = async (start: Date, end: Date) => {
    setError(null);
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create time entry.");
      return;
    }
    const data = await res.json();
    await loadEntries();
    // Immediately open the editor so the user can assign a ticket.
    setEditingEntryId(data.entry.id);
  };

  const handleEventChange = async (id: string, start: Date, end: Date) => {
    setError(null);
    const res = await fetch(`/api/time-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: start.toISOString(), end: end.toISOString() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update time entry.");
      return;
    }
    await loadEntries();
  };

  const handleAssignTicket = async (entryId: string, ticketId: string) => {
    setError(null);
    const res = await fetch(`/api/time-entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to assign ticket.");
      return;
    }
    await loadEntries();
    setEditingEntryId(null);
  };

  // Looks up any Jira ticket by key (not just ones already synced/assigned),
  // adds it to the local ticket cache/sidebar, and returns it for selection.
  const handleLookupTicket = async (key: string): Promise<TicketSummary | null> => {
    const res = await fetch("/api/jira/tickets/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const ticket: TicketSummary = data.ticket;
    setTickets((prev) =>
      prev.some((t) => t.id === ticket.id)
        ? prev.map((t) => (t.id === ticket.id ? ticket : t))
        : [ticket, ...prev]
    );
    return ticket;
  };

  const handleDeleteEntry = async (entryId: string) => {
    const res = await fetch(`/api/time-entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      await loadEntries();
      setEditingEntryId(null);
    }
  };

  const editingEntry = entries.find((e) => e.id === editingEntryId) ?? null;

  const calendarEvents: CalendarEventItem[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.ticket ? `${entry.ticket.key} · ${entry.ticket.summary}` : "Unassigned",
    start: new Date(entry.start),
    end: new Date(entry.end),
    color: entry.ticket?.color ?? "#9ca3af",
    unassigned: !entry.ticket,
    synced: entry.syncedToJira,
    syncError: entry.lastSyncError,
  }));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-white">
        <h1 className="text-lg font-bold">🗓️ Jira Time Calendar</h1>
        <div className="flex items-center gap-4 text-sm">
          {jiraConnected === false && (
            <Link
              href="/settings"
              className="rounded-full bg-yellow-400 px-3 py-1 font-medium text-yellow-900"
            >
              Connect Jira in Settings
            </Link>
          )}
          <span>{session?.user?.name}</span>
          <Link href="/settings" className="underline">
            Settings
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="underline">
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <TicketSidebar
          tickets={tickets}
          loading={loadingTickets}
          syncing={syncing}
          onSync={handleSync}
          onDragStartTicket={setDraggedTicketId}
        />
        <TimeCalendar
          events={calendarEvents}
          onEventChange={handleEventChange}
          onDropTicket={handleDropTicket}
          onCreateBlankEvent={handleCreateBlankEvent}
          onSelectEvent={setEditingEntryId}
          draggedTicketId={draggedTicketId}
        />
      </div>

      {editingEntry && (
        <EventEditorModal
          entry={editingEntry}
          tickets={tickets}
          onClose={() => setEditingEntryId(null)}
          onAssignTicket={(ticketId) => handleAssignTicket(editingEntry.id, ticketId)}
          onDelete={() => handleDeleteEntry(editingEntry.id)}
          onLookupTicket={handleLookupTicket}
        />
      )}
    </div>
  );
}
