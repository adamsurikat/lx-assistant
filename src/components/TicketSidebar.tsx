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
        className="nb-btn nb-btn-green fixed bottom-4 left-4 z-40 gap-2 px-4 py-3 text-sm font-bold uppercase"
        title="Show my open tickets"
      >
        🎫 Tickets
        {tickets.length > 0 && (
          <span className="border-2 border-nb-ink bg-white px-2 py-0.5 text-xs">
            {tickets.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="nb-panel fixed bottom-4 left-4 z-40 flex max-h-[70vh] w-72 flex-col">
      <div className="flex items-center justify-between border-b-2 border-nb-ink bg-nb-green p-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-nb-ink">
          My open tickets
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onSync}
            disabled={syncing}
            className="nb-btn nb-btn-orange px-2 py-1 text-xs font-bold uppercase"
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="nb-btn px-2 py-1 text-xs font-bold"
            title="Collapse"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-sm font-medium text-nb-ink/50">Loading…</p>}
        {!loading && tickets.length === 0 && (
          <p className="text-sm font-medium text-nb-ink/50">
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
              className="nb-panel-sm cursor-grab p-3 transition active:cursor-grabbing"
              style={{ borderLeft: `6px solid ${ticket.color ?? "#FF5F1F"}` }}
              title="Drag onto the calendar to log time"
            >
              <p className="text-sm font-bold text-nb-ink">{ticket.key}</p>
              <p className="truncate text-xs font-medium text-nb-ink/70">{ticket.summary}</p>
              <span className="mt-1 inline-block border-2 border-nb-ink bg-nb-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-nb-ink">
                {ticket.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
