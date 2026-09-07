"use client";

import { useState } from "react";

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
 * Floating, expandable widget (bottom-left) listing open Jira tickets
 * assigned to the user. Each ticket is a native HTML5 drag source; the
 * currently-dragged ticket id is tracked via onDragStartTicket (lifted to
 * the parent page) since react-big-calendar's onDropFromOutside callback
 * doesn't expose the native DragEvent/dataTransfer.
 */
export function TicketSidebar({
  tickets,
  loading,
  syncing,
  onSync,
  onDragStartTicket,
}: TicketSidebarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500"
        title="Show my open tickets"
      >
        🎫 Tickets
        {tickets.length > 0 && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
            {tickets.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-h-[70vh] w-72 flex-col rounded-xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-200 p-3">
        <h2 className="text-sm font-semibold text-gray-700">My open tickets</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            title="Collapse"
          >
            ✕
          </button>
        </div>
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
    </div>
  );
}
