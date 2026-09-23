"use client";

import { useState, type MouseEvent } from "react";
import { RECENTLY_VIEWED_TICKETS_JQL } from "@/lib/jiraJqlPresets";

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
  onDragStartTicket: (ticketId: string) => void;
  onSelectTicket: (ticket: TicketSummary, domEvent: MouseEvent<HTMLElement>) => void;
  jql: string;
  jqlIsDefault: boolean;
  defaultJql: string;
  onSaveJql: (jql: string) => Promise<boolean>;
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
    setDraftJql(jql || defaultJql);
    setEditingJql(true);
  };

  const handleSave = async () => {
    setSavingJql(true);
    try {
      const queryToSave =
        draftJql.trim() === defaultJql.trim() ? "" : draftJql;
      if (await onSaveJql(queryToSave)) setEditingJql(false);
    } finally {
      setSavingJql(false);
    }
  };

  const selectedJqlPreset =
    draftJql.trim() === defaultJql.trim()
      ? "default"
      : draftJql.trim() === RECENTLY_VIEWED_TICKETS_JQL
        ? "recent"
        : "custom";
  const displayedTickets =
    jql.trim() === RECENTLY_VIEWED_TICKETS_JQL ? [...tickets].reverse() : tickets;

  return (
    <div className="absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-nb-ink/10 bg-white md:static md:z-auto md:max-w-none">
      <div className="flex items-center justify-between border-b border-nb-ink/10 p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Tickets</h2>
          {syncing && (
            <span className="text-[10px] font-medium text-nb-ink/50">Syncing…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={editingJql ? () => setEditingJql(false) : openEditor}
            title={jqlIsDefault ? "Using active sprint query — click to customize" : `Custom JQL: ${jql}`}
            className={`nb-btn px-2 py-1 text-xs font-semibold ${editingJql ? "nb-btn-orange" : ""}`}
          >
            JQL{!jqlIsDefault && " •"}
          </button>
        </div>
      </div>
      {editingJql && (
        <div className="space-y-2 border-b border-nb-ink/10 bg-nb-paper p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
            Query preset
            <select
              value={selectedJqlPreset}
              onChange={(e) => {
                if (e.target.value === "default") setDraftJql(defaultJql);
                if (e.target.value === "recent") {
                  setDraftJql(RECENTLY_VIEWED_TICKETS_JQL);
                }
              }}
              className="mt-1 w-full rounded border border-nb-ink/20 bg-white p-1.5 text-xs font-medium normal-case text-nb-ink"
            >
              <option value="default">Active sprint tickets</option>
              <option value="recent">Recently viewed</option>
              <option value="custom">Custom JQL</option>
            </select>
          </label>
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
            Saved queries sync immediately and are also used when the page loads.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={savingJql}
              className="nb-btn nb-btn-orange px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingJql ? "Saving & syncing…" : "Save & sync"}
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
          {displayedTickets.map((ticket) => (
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
