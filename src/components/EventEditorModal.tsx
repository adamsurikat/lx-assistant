"use client";

import { useState } from "react";
import type { TicketSummary } from "@/components/TicketSidebar";

export interface EditableEntry {
  id: string;
  start: string;
  end: string;
  comment: string | null;
  syncedToJira: boolean;
  lastSyncError: string | null;
  ticket: TicketSummary | null;
}

interface EventEditorModalProps {
  entry: EditableEntry;
  tickets: TicketSummary[];
  onClose: () => void;
  onAssignTicket: (ticketId: string) => Promise<void>;
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

/**
 * Modal shown when a calendar time entry is clicked. Lets the user assign
 * (or change) the Jira ticket for the entry, or delete it entirely.
 */
export function EventEditorModal({
  entry,
  tickets,
  onClose,
  onAssignTicket,
  onDelete,
  onLookupTicket,
}: EventEditorModalProps) {
  const [selectedTicketId, setSelectedTicketId] = useState(entry.ticket?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchKey, setSearchKey] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!selectedTicketId) return;
    setSaving(true);
    await onAssignTicket(selectedTicketId);
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
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">Time entry</h2>
        <p className="mb-4 text-sm text-gray-500">{formatRange(entry.start, entry.end)}</p>

        <label className="mb-1 block text-sm font-medium text-gray-700">Ticket</label>
        <select
          value={selectedTicketId}
          onChange={(e) => setSelectedTicketId(e.target.value)}
          className="mb-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select a ticket…
          </option>
          {tickets.map((ticket) => (
            <option key={ticket.id} value={ticket.id}>
              {ticket.key} · {ticket.summary}
            </option>
          ))}
        </select>

        <div className="mb-3 flex items-center gap-2">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !searchKey.trim()}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Add"}
          </button>
        </div>
        {searchError && <p className="mb-2 text-xs text-red-600">{searchError}</p>}

        {entry.ticket && entry.syncedToJira && (
          <p className="mb-2 text-xs font-medium text-green-600">✓ Synced to Jira</p>
        )}
        {entry.lastSyncError && (
          <p className="mb-2 text-xs text-red-600">Sync error: {entry.lastSyncError}</p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={saving || !selectedTicketId || selectedTicketId === entry.ticket?.id}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
