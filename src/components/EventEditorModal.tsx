"use client";

import { useEffect, useRef, useState } from "react";
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
  const [ticket, setTicket] = useState<TicketSummary | null>(entry.ticket);
  const [title, setTitle] = useState(entry.title ?? "");
  const [comment, setComment] = useState(entry.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Ticket combobox: a single search box that shows a dropdown of the
  // tracked/active tickets on focus (auto-suggest style, arrow-key
  // navigable), and swaps to filtered + remotely-searched results once the
  // user starts typing.
  const [query, setQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [remoteMatch, setRemoteMatch] = useState<TicketSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Lets the user drag the modal panel around the screen by its header.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const trimmedQuery = query.trim();
  const isSearchingText = trimmedQuery.length > 0;

  // While the user is typing, the "suggested" (full) list is replaced by
  // tracked tickets that match the query text.
  const localMatches = isSearchingText
    ? tickets.filter(
        (t) =>
          t.key.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
          t.summary.toLowerCase().includes(trimmedQuery.toLowerCase())
      )
    : tickets;

  // Any remote match (an untracked ticket found by exact key) that isn't
  // already present in the local matches gets appended to the list.
  const remoteExtra =
    isSearchingText && remoteMatch && !localMatches.some((t) => t.id === remoteMatch.id)
      ? [remoteMatch]
      : [];

  const comboOptions = [...localMatches, ...remoteExtra];

  // Debounced remote lookup-by-key for tickets not in the tracked list,
  // e.g. ad hoc tickets not currently assigned to the user. The stale
  // error/remoteMatch for the *previous* query are cleared synchronously in
  // handleQueryChange below, not here, so this effect only ever sets state
  // asynchronously (inside the timeout callback).
  useEffect(() => {
    if (!isSearchingText) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      const found = await onLookupTicket(trimmedQuery);
      setSearching(false);
      if (found) {
        setRemoteMatch(found);
        setSearchError(null);
      } else {
        setRemoteMatch(null);
        setSearchError(localMatches.length === 0 ? `No Jira ticket found for "${trimmedQuery}"` : null);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery]);

  useEffect(() => {
    if (!comboOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [comboOpen]);

  const handleQueryChange = (value: string) => {
    // Jira keys use a dash (e.g. PROJ-123), not a space, so auto-convert
    // spaces as the user types to make "proj 123" resolve like "proj-123".
    setQuery(value.replace(/ /g, "-"));
    setHighlighted(0);
    setRemoteMatch(null);
    setSearchError(null);
  };

  const openCombo = () => {
    setQuery("");
    setHighlighted(0);
    setComboOpen(true);
  };

  const selectTicket = (t: TicketSummary | null) => {
    setTicket(t);
    setQuery("");
    setRemoteMatch(null);
    setSearchError(null);
    setComboOpen(false);
    inputRef.current?.blur();
  };

  const handleComboKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!comboOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setComboOpen(true);
      }
      return;
    }
    // Index 0 is always the "No ticket" option, followed by comboOptions.
    const maxIndex = comboOptions.length; // inclusive upper bound
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, maxIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted === 0) {
        selectTicket(null);
      } else {
        const picked = comboOptions[highlighted - 1];
        if (picked) selectTicket(picked);
      }
    } else if (e.key === "Escape") {
      setComboOpen(false);
      setQuery("");
      inputRef.current?.blur();
    } else if (e.key === "Tab") {
      // Close the autosuggest and jump straight to the title field instead
      // of tabbing through the dropdown options.
      e.preventDefault();
      setComboOpen(false);
      titleInputRef.current?.focus();
    }
  };

  const hasTicket = ticket !== null;
  const isNew = entry.id === null;
  // Once a ticket is attached, the title is always the ticket's key —
  // the input becomes read-only to make that obvious.
  const effectiveTitle = hasTicket ? ticket!.key : title.trim();
  const trimmedComment = comment.trim();
  const unchanged =
    (ticket?.id ?? null) === (entry.ticket?.id ?? null) &&
    effectiveTitle === (entry.title ?? "").trim() &&
    trimmedComment === (entry.comment ?? "").trim();

  const handleSave = async () => {
    if (!hasTicket && !effectiveTitle) return;
    if (hasTicket && !trimmedComment) return;
    setSaving(true);
    await onSave({
      ticketId: hasTicket ? ticket!.id : null,
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
        <div ref={comboRef} className="relative mb-5">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={comboOpen}
            aria-controls="ticket-combobox-listbox"
            aria-autocomplete="list"
            value={comboOpen ? query : ticket ? `${ticket.key} · ${ticket.summary}` : ""}
            onFocus={openCombo}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleComboKeyDown}
            placeholder="Search tickets or type a ticket number, e.g. PROJ-123"
            className="nb-input w-full px-3 py-2 text-sm"
            style={searchError ? { borderColor: "var(--nb-pink)", borderWidth: 2 } : undefined}
          />
          {comboOpen && (
            <div
              id="ticket-combobox-listbox"
              role="listbox"
              className="nb-panel-sm absolute z-50 mt-1 max-h-60 w-full overflow-y-auto bg-white p-1 text-left"
            >
              <button
                type="button"
                role="option"
                aria-selected={highlighted === 0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectTicket(null)}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium ${
                  highlighted === 0 ? "bg-nb-orange/10 text-nb-ink" : "text-nb-ink/70 hover:bg-nb-orange/10"
                }`}
              >
                No ticket
              </button>
              {comboOptions.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={highlighted === i + 1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectTicket(t)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    highlighted === i + 1 ? "bg-nb-orange/10 text-nb-ink" : "text-nb-ink hover:bg-nb-orange/10"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color ?? "#9ca3af" }}
                  />
                  <span className="truncate">
                    <span className="font-semibold">{t.key}</span> · {t.summary}
                  </span>
                </button>
              ))}
              {isSearchingText && searching && (
                <p className="px-2 py-1.5 text-xs font-medium text-nb-ink/50">Searching…</p>
              )}
              {isSearchingText && !searching && comboOptions.length === 0 && (
                <p className="px-2 py-1.5 text-xs font-medium text-nb-ink/50">
                  {searchError ?? "No matching tickets"}
                </p>
              )}
            </div>
          )}
        </div>

        {hasTicket && (
          <div className="mb-5 flex items-center gap-2 rounded-full border border-nb-orange/30 bg-nb-orange/10 px-3 py-2 text-xs font-bold text-nb-ink">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ticket!.color ?? "#9ca3af" }}
            />
            <span>
              Jira ticket · {ticket!.key} · {ticket!.summary}
            </span>
          </div>
        )}

        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
            Title{!hasTicket && <span className="text-nb-pink"> *</span>}
          </label>
          <input
            ref={titleInputRef}
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
