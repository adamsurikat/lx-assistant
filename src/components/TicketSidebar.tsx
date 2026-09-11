"use client";

import { useState, type MouseEvent } from "react";

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
  onSelectTicket: (ticket: TicketSummary, domEvent: MouseEvent<HTMLElement>) => void;
  jql: string;
  jqlIsDefault: boolean;
  defaultJql: string;
  onSaveJql: (jql: string) => Promise<void>;
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
  onSelectTicket,
  jql,
  jqlIsDefault,
  defaultJql,
  onSaveJql,
}: TicketSidebarProps) {
  const [editingJql, setEditingJql] = useState(false);
  const [draftJql, setDraftJql] = useState(jql);
  const [savingJql, setSavingJql] = useState(false);

  const openEditor = () => {
    setDraftJql(jql);
    setEditingJql(true);
  };

  const handleSave = async () => {
    setSavingJql(true);
    try {
      await onSaveJql(draftJql);
      setEditingJql(false);
    } finally {
      setSavingJql(false);
    }
  };

  const handleResetToDefault = async () => {
    setSavingJql(true);
    try {
      await onSaveJql(defaultJql);
      setDraftJql(defaultJql);
      setEditingJql(false);
    } finally {
      setSavingJql(false);
    }
  };

  return (
    <div className="absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-nb-ink/10 bg-white md:static md:z-auto md:max-w-none">
      <div className="flex items-center justify-between border-b border-nb-ink/10 p-3">
        <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Tickets</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={editingJql ? () => setEditingJql(false) : openEditor}
            title={jqlIsDefault ? "Using default JQL — click to customize" : `Custom JQL: ${jql}`}
            className={`nb-btn px-2 py-1 text-xs font-semibold ${editingJql ? "nb-btn-orange" : ""}`}
          >
            JQL{!jqlIsDefault && " •"}
          </button>
          <button
            onClick={onSync}
            disabled={syncing}
            className="nb-btn nb-btn-orange px-2 py-1 text-xs font-semibold"
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>
      {editingJql && (
        <div className="space-y-2 border-b border-nb-ink/10 bg-nb-paper p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
            Custom sync query
            <textarea
              value={draftJql}
              onChange={(e) => setDraftJql(e.target.value)}
              rows={4}
              spellCheck={false}
              className="mt-1 w-full rounded border border-nb-ink/20 p-1.5 font-mono text-[11px] font-normal normal-case text-nb-ink"
            />
          </label>
          <p className="text-[10px] font-medium normal-case text-nb-ink/50">
            Used by Sync instead of the default. Cleared/blank resets to default.
          </p>
          <div className="flex items-center justify-end gap-2">
            {!jqlIsDefault && (
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={savingJql}
                className="text-xs font-semibold text-nb-ink/60 hover:underline disabled:opacity-50"
              >
                Reset to default
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={savingJql}
              className="nb-btn nb-btn-orange px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingJql ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-sm font-medium text-nb-ink/50">Loading…</p>}
        {!loading && tickets.length === 0 && (
          <p className="text-sm font-medium text-nb-ink/50">
            No open tickets in an active sprint. Click Sync to pull from Jira.
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
              onClick={(e) => onSelectTicket(ticket, e)}
              className="nb-panel-sm cursor-grab p-3 transition active:cursor-grabbing"
              style={{ borderLeft: `6px solid ${ticket.color ?? "#FF5F1F"}` }}
              title="Drag onto the calendar to log time, click for details"
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

