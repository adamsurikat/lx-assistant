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
  // Whether the entry's current ticket (if any) is one of the tracked
  // sidebar tickets, so the dropdown can preselect it; otherwise it must
  // have been set via a one-off custom-ticket search (see `customTicket`).
  const initialTrackedMatch =
    entry.ticket && tickets.some((t) => t.id === entry.ticket!.id) ? entry.ticket.id : NO_TICKET;

  const [trackedSelection, setTrackedSelection] = useState(initialTrackedMatch);
  // A ticket found via the search box, kept only for this modal instance —
  // it's never added to the tracked ticket list/dropdown, just used
  // directly as the entry's ticket and shown as a summary below the box.
  const [customTicket, setCustomTicket] = useState<TicketSummary | null>(
    entry.ticket && !tickets.some((t) => t.id === entry.ticket!.id) ? entry.ticket : null
  );
  const [title, setTitle] = useState(entry.title ?? "");
  const [comment, setComment] = useState(entry.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchKey, setSearchKey] = useState("");
  const [searching, setSearching] = useState(false);
  // Only set when a search comes back empty — shown as a red border on
  // the search input. A successful match is applied immediately.
  const [searchError, setSearchError] = useState<string | null>(null);
  // Lets the user drag the modal panel around the screen by its header.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // The custom search result (if any) takes precedence over the tracked
  // dropdown selection — the two are mutually exclusive.
  const effectiveTicket =
    customTicket ?? (trackedSelection !== NO_TICKET ? tickets.find((t) => t.id === trackedSelection) ?? null : null);

  const hasTicket = effectiveTicket !== null;
  const isNew = entry.id === null;
  // Once a ticket is attached, the title is always the ticket's key —
  // the input becomes read-only to make that obvious.
  const effectiveTitle = hasTicket ? effectiveTicket!.key : title.trim();
  const trimmedComment = comment.trim();
  const unchanged =
    (effectiveTicket?.id ?? null) === (entry.ticket?.id ?? null) &&
    effectiveTitle === (entry.title ?? "").trim() &&
    trimmedComment === (entry.comment ?? "").trim();

  const handleSave = async () => {
    if (!hasTicket && !effectiveTitle) return;
    if (hasTicket && !trimmedComment) return;
    setSaving(true);
    await onSave({
      ticketId: hasTicket ? effectiveTicket!.id : null,
      title: effectiveTitle,
      comment: trimmedComment,
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  // Dragging the header repositions the modal panel via a translate
  // offset added on top of its normal centered position.
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = dragOffset.x;
    const originY = dragOffset.y;

    const onMove = (moveEvent: MouseEvent) => {
      setDragOffset({
        x: originX + (moveEvent.clientX - startX),
        y: originY + (moveEvent.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSearch = async () => {
    const key = searchKey.trim();
    if (!key) return;
    setSearching(true);
    setSearchError(null);
    const ticket = await onLookupTicket(key);
    if (ticket) {
      setCustomTicket(ticket);
      setTrackedSelection(NO_TICKET);
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
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleDragStart}
          className="-m-2 mb-6 cursor-move select-none rounded-lg p-2"
        >
          <h2 className="nb-display mb-2 text-lg">{isNew ? "New time entry" : "Time entry"}</h2>
          <p className="text-sm font-medium text-nb-ink/60">
            {formatRange(entry.start, entry.end)}
          </p>
          <p className="text-sm font-medium text-nb-ink/60">
            {formatDuration(entry.start, entry.end)}
          </p>
        </div>


        <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
          Ticket
        </label>
        <select
          value={trackedSelection}
          onChange={(e) => {
            const value = e.target.value;
            setTrackedSelection(value);
            setCustomTicket(null);
            setSearchKey("");
            setSearchError(null);
          }}
          className="nb-input mb-5 w-full px-3 py-2 text-sm"
        >
          <option value={NO_TICKET}>No ticket</option>
          {tickets.map((ticket) => (
            <option key={ticket.id} value={ticket.id}>
              {ticket.key} · {ticket.summary}
            </option>
          ))}
        </select>

        <div className="mb-5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchKey}
              onChange={(e) => {
                setSearchKey(e.target.value);
                setSearchError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Or type a ticket number, e.g. PROJ-123"
              className="nb-input w-full px-3 py-2 text-sm"
              style={searchError ? { borderColor: "var(--nb-pink)", borderWidth: 2 } : undefined}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !searchKey.trim()}
              className="nb-btn shrink-0 px-3 py-2 text-sm font-semibold"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {hasTicket && (
          <div className="mb-5 flex items-center gap-2 rounded-full border border-nb-orange/30 bg-nb-orange/10 px-3 py-2 text-xs font-bold text-nb-ink">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: effectiveTicket!.color ?? "#9ca3af" }}
            />
            <span>
              Jira ticket · {effectiveTicket!.key} · {effectiveTicket!.summary}
            </span>
          </div>
        )}

        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
            Title{!hasTicket && <span className="text-nb-pink"> *</span>}
          </label>
          <input
            type="text"
            value={effectiveTitle}
            onChange={(e) => setTitle(e.target.value)}
            disabled={hasTicket}
            placeholder="e.g. Team meeting, PTO, focus time…"
            className="nb-input w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
          {hasTicket ? (
            <p className="mt-2 text-xs font-medium text-nb-ink/50">
              Set automatically from the linked ticket.
            </p>
          ) : (
            <p className="mt-2 text-xs font-medium text-nb-ink/50">
              Entries without a ticket aren&apos;t synced to Jira.
            </p>
          )}
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
            Description{hasTicket && <span className="text-nb-pink"> *</span>}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              hasTicket
                ? "Note to add as a comment on the Jira worklog…"
                : "Optional extra details…"
            }
            rows={3}
            className="nb-input w-full resize-none px-3 py-2 text-sm"
          />
          {hasTicket && !trimmedComment && (
            <p className="mt-2 text-xs font-medium text-nb-ink/50">
              Required — describe what you worked on.
            </p>
          )}
        </div>

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
                saving || (!hasTicket && !effectiveTitle) || (hasTicket && !trimmedComment) || unchanged
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
