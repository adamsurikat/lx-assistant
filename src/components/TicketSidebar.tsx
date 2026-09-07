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
 * Expandable sidebar (left of the calendar) listing open Jira tickets
 * assigned to the user. Visibility is controlled by the parent page (see the
 * "Tickets" toggle button in the calendar toolbar); this component only
 * renders while expanded. Each ticket is a native HTML5 drag source; the
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
  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-nb-ink/10 bg-white">
      <div className="flex items-center justify-between border-b border-nb-ink/10 bg-nb-green p-3">
        <h2 className="text-sm font-semibold tracking-wide text-nb-ink">
          My open tickets
        </h2>
        <button
          onClick={onSync}
          disabled={syncing}
          className="nb-btn nb-btn-orange px-2 py-1 text-xs font-semibold"
        >
          {syncing ? "Syncing…" : "Sync"}
        </button>
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
              <span className="mt-1 nb-badge text-nb-ink">
                {ticket.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
