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
  userId: string | null;
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
  userId,
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
  const customJqlStorageKey = userId ? `lx-assistant:custom-ticket-jql:${userId}` : null;
  const [customJqlState, setCustomJqlState] = useState(() => {
    const activeQuery = jql.trim();
    let query = activeQuery &&
      activeQuery !== defaultJql.trim() &&
      activeQuery !== RECENTLY_VIEWED_TICKETS_JQL
      ? jql
      : "";
    if (!customJqlStorageKey || typeof window === "undefined") {
      return { query, error: null as string | null };
    }
    try {
      const storedQuery = window.localStorage.getItem(customJqlStorageKey);
      if (storedQuery !== null) {
        query = storedQuery;
      }
      return { query, error: null as string | null };
    } catch (err) {
      return {
        query,
        error:
          err instanceof Error
            ? `Could not load custom JQL from local storage: ${err.message}`
            : "Could not load custom JQL from local storage.",
      };
    }
  });
  const [savingJql, setSavingJql] = useState(false);
  const [pendingJqlPreset, setPendingJqlPreset] = useState<string | null>(null);
  const customJql = customJqlState.query;
  const customJqlStorageError = customJqlState.error;

  const persistCustomJql = (query: string): string | null => {
    if (!customJqlStorageKey) return null;
    try {
      window.localStorage.setItem(customJqlStorageKey, query);
      return null;
    } catch (err) {
      return err instanceof Error
        ? `Could not save custom JQL to local storage: ${err.message}`
        : "Could not save custom JQL to local storage.";
    }
  };

  const openEditor = () => {
    setDraftJql(jql || defaultJql);
    setEditingJql(true);
  };

  const handleSave = async () => {
    setSavingJql(true);
    try {
      const queryToSave =
        draftJql.trim() === defaultJql.trim() ? "" : draftJql;
      if (await onSaveJql(queryToSave)) {
        setEditingJql(false);
        setPendingJqlPreset(null);
      }
    } finally {
      setSavingJql(false);
    }
  };

  const activeJqlPreset =
    pendingJqlPreset ??
    (jql.trim() === defaultJql.trim()
      ? "default"
      : jql.trim() === RECENTLY_VIEWED_TICKETS_JQL
        ? "recent"
        : "custom");

  const handlePresetChange = async (preset: string) => {
    if (preset === "custom" && !customJql.trim()) {
      setDraftJql("");
      setPendingJqlPreset("custom");
      setEditingJql(true);
      return;
    }

    const query =
      preset === "default"
        ? defaultJql
        : preset === "recent"
          ? RECENTLY_VIEWED_TICKETS_JQL
          : customJql;
    setPendingJqlPreset(preset);
    setSavingJql(true);
    try {
      const queryToSave = query.trim() === defaultJql.trim() ? "" : query;
      if (await onSaveJql(queryToSave)) {
        setDraftJql(query);
        setEditingJql(false);
      }
    } finally {
      setSavingJql(false);
      setPendingJqlPreset(null);
    }
  };

  const displayedTickets =
    jql.trim() === RECENTLY_VIEWED_TICKETS_JQL ? [...tickets].reverse() : tickets;

  return (
    <div className="absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-nb-ink/10 bg-white md:static md:z-auto md:max-w-none">
      <div className="space-y-2 border-b border-nb-ink/10 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Tickets</h2>
            {syncing && (
              <span className="text-[10px] font-medium text-nb-ink/50">Syncing…</span>
            )}
          </div>
          <button
            onClick={
              editingJql
                ? () => {
                    setEditingJql(false);
                    setPendingJqlPreset(null);
                  }
                : openEditor
            }
            title={jqlIsDefault ? "Using active sprint query — click to customize" : `Custom JQL: ${jql}`}
            className={`nb-btn px-2 py-1 text-xs font-semibold ${editingJql ? "nb-btn-orange" : ""}`}
          >
            JQL{!jqlIsDefault && " •"}
          </button>
        </div>
        <select
          aria-label="Jira ticket query preset"
          value={activeJqlPreset}
          onChange={(e) => void handlePresetChange(e.target.value)}
          disabled={savingJql || syncing}
          className="w-full rounded border border-nb-ink/20 bg-white p-1.5 text-xs font-medium text-nb-ink disabled:opacity-50"
        >
          <option value="default">Active sprint tickets</option>
          <option value="recent">Recently viewed</option>
          <option value="custom">Custom JQL</option>
        </select>
      </div>
      {editingJql && (
        <div className="space-y-2 border-b border-nb-ink/10 bg-nb-paper p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
            Custom sync query
            <textarea
              value={draftJql}
              onChange={(e) => {
                const value = e.target.value;
                setDraftJql(value);
                setCustomJqlState({
                  query: value,
                  error: persistCustomJql(value),
                });
              }}
              rows={4}
              spellCheck={false}
              className="mt-1 w-full rounded border border-nb-ink/20 p-1.5 font-mono text-[11px] font-normal normal-case text-nb-ink"
            />
          </label>
          {customJqlStorageError && (
            <p className="text-[10px] font-medium normal-case text-nb-pink">
              {customJqlStorageError}
            </p>
          )}
          <p className="text-[10px] font-medium normal-case text-nb-ink/50">
            Custom JQL is saved in this browser as you type. Saving the selected query
            syncs immediately; it is also used when the page loads.
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
            No tickets match the current query.
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
