"use client";

import { useEffect, useRef, useState } from "react";
import type { TicketSummary } from "@/components/TicketSidebar";

const EVENT_PRESETS = [
  "Vacation",
  "Team lead",
  "Sprint demo",
  "Surikat hours",
  "Sick",
  "VAB",
  "Parental leave",
  "Monthly meeting",
  "Conference",
];

type EventOption =
  | { kind: "preset"; title: string }
  | { kind: "ticket"; ticket: TicketSummary };

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
  autoFocusDescription?: boolean;
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
  autoFocusDescription = false,
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

  // Presets and tracked tickets share a searchable, keyboard-navigable list.
  const [query, setQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [remoteMatch, setRemoteMatch] = useState<TicketSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocusDescription) commentInputRef.current?.focus();
  }, [autoFocusDescription]);

  // Lets the user drag the modal panel around the screen by its header.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const trimmedQuery = query.trim();
  const isSearchingText = trimmedQuery.length > 0;
  const textQuery = trimmedQuery.toLowerCase();
  // Keep spaces in preset names; normalize only Jira keys so "proj 123"
  // still resolves like "proj-123".
  const ticketQuery = textQuery.replace(/\s+/g, "-");
  const lookupKey = /^(?:[a-z][a-z0-9_]*-\d+|\d+)$/i.test(ticketQuery)
    ? ticketQuery
    : "";
  const presetMatches = EVENT_PRESETS.filter((preset) =>
    preset.toLowerCase().includes(textQuery)
  );
  const selectedPreset = !ticket ? EVENT_PRESETS.find((preset) => preset === title.trim()) : undefined;

  const localMatches = isSearchingText
    ? tickets.filter(
        (t) =>
          t.key.toLowerCase().includes(ticketQuery) ||
          t.summary.toLowerCase().includes(textQuery)
      )
    : tickets;
  const hasLocalMatches = localMatches.length > 0;

  // Any remote match (an untracked ticket found by exact key) that isn't
  // already present in the local matches gets appended to the list.
  const remoteExtra =
    isSearchingText && remoteMatch && !localMatches.some((t) => t.id === remoteMatch.id)
      ? [remoteMatch]
      : [];

  const comboOptions: EventOption[] = [
    ...[...localMatches, ...remoteExtra].map((ticket): EventOption => ({ kind: "ticket", ticket })),
    ...presetMatches.map((title): EventOption => ({ kind: "preset", title })),
  ];

  // Only ticket keys/IDs trigger a remote lookup. Preset searches stay local.
  useEffect(() => {
    if (!lookupKey) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      const found = await onLookupTicket(lookupKey);
      if (cancelled) return;
      setSearching(false);
      if (found) {
        setRemoteMatch(found);
        setSearchError(null);
      } else {
        setRemoteMatch(null);
        setSearchError(hasLocalMatches ? null : `No Jira ticket found for "${lookupKey}"`);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, lookupKey, onLookupTicket, hasLocalMatches]);

  useEffect(() => {
    if (comboOpen) {
      document.getElementById(`event-combobox-option-${highlighted}`)?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [comboOpen, highlighted]);

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
    setQuery(value);
    setHighlighted(0);
    setRemoteMatch(null);
    setSearchError(null);
    setSearching(false);
  };

  const openCombo = () => {
    handleQueryChange("");
    setComboOpen(true);
  };

  const selectTicket = (t: TicketSummary | null) => {
    setTicket(t);
    handleQueryChange("");
    setComboOpen(false);
    inputRef.current?.blur();
  };

  const selectOption = (option: EventOption) => {
    if (option.kind === "preset") {
      selectTicket(null);
      setTitle(option.title);
    } else {
      selectTicket(option.ticket);
    }
    commentInputRef.current?.focus();
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
        titleInputRef.current?.focus();
      } else {
        const picked = comboOptions[highlighted - 1];
        if (picked) selectOption(picked);
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


        <label htmlFor="event-option" className="mb-2 block text-sm font-semibold tracking-wide text-nb-ink">
          Preset or Jira ticket
        </label>
        <div ref={comboRef} className="relative mb-5">
          <input
            id="event-option"
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={comboOpen}
            aria-controls="event-combobox-listbox"
            aria-activedescendant={comboOpen ? `event-combobox-option-${highlighted}` : undefined}
            aria-autocomplete="list"
            value={comboOpen ? query : ticket ? `${ticket.key} · ${ticket.summary}` : selectedPreset ?? ""}
            onFocus={openCombo}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleComboKeyDown}
            placeholder="Choose a preset or search Jira tickets…"
            className="nb-input w-full px-3 py-2 text-sm"
            style={searchError ? { borderColor: "var(--nb-pink)", borderWidth: 2 } : undefined}
          />
          {comboOpen && (
            <div
              id="event-combobox-listbox"
              role="listbox"
              aria-label="Presets and Jira tickets"
              className="nb-panel-sm absolute z-50 mt-1 max-h-60 w-full overflow-y-auto bg-white p-1 text-left"
            >
              <button
                id="event-combobox-option-0"
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
              {comboOptions.map((option, i) => (
                <button
                  key={option.kind === "preset" ? `preset-${option.title}` : option.ticket.id}
                  id={`event-combobox-option-${i + 1}`}
                  type="button"
                  role="option"
                  aria-selected={highlighted === i + 1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    highlighted === i + 1 ? "bg-nb-orange/10 text-nb-ink" : "text-nb-ink hover:bg-nb-orange/10"
                  }`}
                >
                  {option.kind === "preset" ? (
                    <>
                      <span className="flex-1 font-medium">{option.title}</span>
                      <span className="text-xs text-nb-ink/50">Preset</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: option.ticket.color ?? "#9ca3af" }}
                      />
                      <span className="truncate">
                        <span className="font-semibold">{option.ticket.key}</span> · {option.ticket.summary}
                      </span>
                    </>
                  )}
                </button>
              ))}
              {isSearchingText && searching && (
                <p className="px-2 py-1.5 text-xs font-medium text-nb-ink/50">Searching…</p>
              )}
              {isSearchingText && !searching && comboOptions.length === 0 && (
                <p className="px-2 py-1.5 text-xs font-medium text-nb-ink/50">
                  {searchError ?? "No matching presets or tickets"}
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
            ref={commentInputRef}
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
