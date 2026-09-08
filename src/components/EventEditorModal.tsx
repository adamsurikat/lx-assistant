"use client";

import { useState } from "react";
import type { TicketSummary } from "@/components/TicketSidebar";

export interface EditableEntry {
  id: string | null;
  start: string;
  end: string;
  title: string | null;
  comment: string | null;
  syncedToJira: boolean;
  lastSyncError: string | null;
  ticket: TicketSummary | null;
}

interface EventEditorModalProps {
  entry: EditableEntry;
  tickets: TicketSummary[];
  onClose: () => void;
  onSave: (payload: {
    ticketId: string | null;
    title: string | null;
    comment: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onLookupTicket: (key: string) => Promise<TicketSummary | null>;
}

function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Formats the duration between two ISO timestamps as e.g. "1h 30m" or "45m". */
export function formatDuration(startISO: string, endISO: string): string {
  const minutes = Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Sentinel value for the "no ticket" dropdown option, distinct from the
// empty string used by the disabled placeholder option.
const NO_TICKET = "__no_ticket__";

/**
 * Modal shown when a calendar time entry is clicked. Lets the user assign
 * (or change) the Jira ticket for the entry, give it a custom title instead
 * of a ticket, or delete it entirely.
 */
export function EventEditorModal({
  entry,
  tickets,
  onClose,
  onSave,
  onDelete,
  onLookupTicket,
}: EventEditorModalProps) {
  const [selectedTicketId, setSelectedTicketId] = useState(entry.ticket?.id ?? NO_TICKET);
  const [title, setTitle] = useState(entry.ticket ? "" : entry.title ?? "");
  const [comment, setComment] = useState(entry.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchKey, setSearchKey] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Tickets found via the search box (or the entry's own current ticket)
  // that aren't in the tracked `tickets` list, kept only for this modal
  // instance so they show up as a selectable option without being added to
  // the sidebar's permanently tracked list.
  const [adHocTickets, setAdHocTickets] = useState<TicketSummary[]>(
    entry.ticket && !tickets.some((t) => t.id === entry.ticket!.id) ? [entry.ticket] : []
  );

  const ticketOptions = [
    ...tickets,
    ...adHocTickets.filter((t) => !tickets.some((existing) => existing.id === t.id)),
  ];

  const hasTicket = selectedTicketId !== NO_TICKET;
  const isNew = entry.id === null;
  const trimmedTitle = title.trim();
  const trimmedComment = comment.trim();
  const unchanged =
    selectedTicketId === (entry.ticket?.id ?? NO_TICKET) &&
    (hasTicket || trimmedTitle === (entry.title ?? "").trim()) &&
    trimmedComment === (entry.comment ?? "").trim();

  const handleSave = async () => {
    if (!hasTicket && !trimmedTitle) return;
    if (hasTicket && !trimmedComment) return;
    setSaving(true);
    await onSave({
      ticketId: hasTicket ? selectedTicketId : null,
      title: hasTicket ? null : trimmedTitle,
      comment: trimmedComment,
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  const handleSearch = async () => {
    const key = searchKey.trim();
    if (!key) return;
    setSearching(true);
    setSearchError(null);
    const ticket = await onLookupTicket(key);
    if (ticket) {
      setAdHocTickets((prev) =>
        prev.some((t) => t.id === ticket.id) ? prev : [ticket, ...prev]
      );
      setSelectedTicketId(ticket.id);
      setSearchKey("");
    } else {
      setSearchError(`No Jira ticket found for "${key}"`);
    }
    setSearching(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="nb-panel w-full max-w-md bg-white p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="nb-display mb-2 text-lg">{isNew ? "New time entry" : "Time entry"}</h2>
        <p className="text-sm font-medium text-nb-ink/60">
          {formatRange(entry.start, entry.end)}
        </p>
        <p className="mb-6 text-sm font-medium text-nb-ink/60">
          {formatDuration(entry.start, entry.end)}
        </p>

        <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
          Ticket
        </label>
        <select
          value={selectedTicketId}
          onChange={(e) => setSelectedTicketId(e.target.value)}
          className="nb-input mb-5 w-full px-3 py-2 text-sm"
        >
          <option value={NO_TICKET}>No ticket — use a custom title</option>
          {ticketOptions.map((ticket) => (
            <option key={ticket.id} value={ticket.id}>
              {ticket.key} · {ticket.summary}
            </option>
          ))}
        </select>

        <div className="mb-5 flex items-center gap-2">
          <input
            type="text"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Or type a ticket number, e.g. PROJ-123"
            className="nb-input w-full px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !searchKey.trim()}
            className="nb-btn shrink-0 px-3 py-2 text-sm font-semibold"
          >
            {searching ? "Searching…" : "Add"}
          </button>
        </div>
        {searchError && <p className="mb-4 text-xs font-bold text-nb-pink">{searchError}</p>}

        {!hasTicket && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Team meeting, PTO, focus time…"
              className="nb-input w-full px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs font-medium text-nb-ink/50">
              Entries without a ticket aren&apos;t synced to Jira.
            </p>
          </div>
        )}

        {hasTicket && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
              Comment <span className="text-nb-pink">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Note to add as a comment on the Jira worklog…"
              rows={3}
              className="nb-input w-full resize-none px-3 py-2 text-sm"
            />
            {!trimmedComment && (
              <p className="mt-2 text-xs font-medium text-nb-ink/50">
                Required — describe what you worked on.
              </p>
            )}
          </div>
        )}

        {entry.ticket && entry.syncedToJira && (
          <p className="mb-3 text-xs font-semibold text-nb-green">✓ Synced to Jira</p>
        )}
        {entry.lastSyncError && (
          <p className="mb-3 text-xs font-bold text-nb-pink">
            Sync error: {entry.lastSyncError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          {isNew ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="nb-btn px-4 py-2 text-sm font-semibold text-nb-pink"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="nb-btn px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving || (!hasTicket && !trimmedTitle) || (hasTicket && !trimmedComment) || unchanged
              }
              className="nb-btn nb-btn-orange px-4 py-2 text-sm font-semibold"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
