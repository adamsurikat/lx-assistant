"use client";

export interface TicketSummary {
  id: string;
  key: string;
  summary: string;
  status: string;
  color: string | null;
}

interface TicketSidebarProps {
  tickets: TicketSummary[];
  loading: boolean;
  syncing: boolean;
  onSync: () => void;
  onDragStartTicket: (ticketId: string) => void;
}

/**
 * Sidebar listing open Jira tickets assigned to the user. Each ticket is a
 * native HTML5 drag source; the currently-dragged ticket id is tracked via
 * onDragStartTicket (lifted to the parent page) since react-big-calendar's
 * onDropFromOutside callback doesn't expose the native DragEvent/dataTransfer.
 */
export function TicketSidebar({
  tickets,
  loading,
  syncing,
  onSync,
  onDragStartTicket,
}: TicketSidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700">My open tickets</h2>
        <button
          onClick={onSync}
          disabled={syncing}
          className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && tickets.length === 0 && (
          <p className="text-sm text-gray-400">
            No open tickets. Click Sync to pull from Jira.
          </p>
        )}
        <ul className="space-y-2">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              draggable
              onDragStart={(e) => {
                onDragStartTicket(ticket.id);
                e.dataTransfer.setData("application/x-ticket-id", ticket.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="cursor-grab rounded-lg border border-gray-200 p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
              style={{ borderLeft: `4px solid ${ticket.color ?? "#6366f1"}` }}
              title="Drag onto the calendar to log time"
            >
              <p className="text-sm font-semibold text-gray-800">{ticket.key}</p>
              <p className="truncate text-xs text-gray-500">{ticket.summary}</p>
              <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                {ticket.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
