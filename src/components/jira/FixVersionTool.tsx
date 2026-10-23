"use client";

import { useEffect, useRef, useState } from "react";
import type { JiraTicket, JiraFixVersionUpdateResult } from "@/lib/jira";
import { FixVersionSelect } from "./FixVersionSelect";
import { TicketSelection } from "./TicketSelection";

export function FixVersionTool({ initialFixVersions, updating, onUpdatingChange }: {
  initialFixVersions: string[] | null;
  updating: boolean;
  onUpdatingChange: (updating: boolean) => void;
}) {
  const [refresh, setRefresh] = useState(0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="nb-display text-base">Open tickets without a fix version</h2>
          <p className="mt-1 text-sm text-nb-ink/60">Assigned to you</p>
        </div>
        <button type="button" disabled={updating} className="nb-btn px-3 py-2 text-sm" onClick={() => setRefresh((value) => value + 1)}>
          Refresh
        </button>
      </div>
      <UnversionedTickets key={refresh} initialFixVersions={initialFixVersions} updating={updating} onUpdatingChange={onUpdatingChange} />
    </div>
  );
}

function UnversionedTickets({ initialFixVersions, updating, onUpdatingChange }: {
  initialFixVersions: string[] | null;
  updating: boolean;
  onUpdatingChange: (updating: boolean) => void;
}) {
  const [result, setResult] = useState<{ tickets: JiraTicket[]; siteUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<(JiraFixVersionUpdateResult & { version: string }) | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTickets() {
      try {
        const response = await fetch("/api/jira/unversioned-tickets", { signal: controller.signal, cache: "no-store" });
        if (response.redirected) throw new Error("Your session expired. Sign in again to load tickets.");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load tickets.");
        if (!controller.signal.aborted) setResult(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load tickets.");
      }
    }
    void loadTickets();
    return () => controller.abort();
  }, []);

  async function setSelectedFixVersions(fixVersion: string) {
    if (updating || !fixVersion || !selectedIds.length) return;
    onUpdatingChange(true);
    setOutcome(null);
    setUpdateError(null);
    try {
      const response = await fetch("/api/jira/unversioned-tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixVersion, ticketIds: selectedIds }),
      });
      if (response.redirected) throw new Error("Your session expired. Sign in again to update tickets.");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update tickets. Refresh before retrying.");
      const update: JiraFixVersionUpdateResult = data;
      const updatedIds = new Set(update.updated.map((ticket) => ticket.id));
      // Jira search can lag writes; remove only the confirmed successes locally.
      setResult((previous) => previous && { ...previous, tickets: previous.tickets.filter((ticket) => !updatedIds.has(ticket.id)) });
      setSelectedIds((previous) => previous.filter((id) => !updatedIds.has(id)));
      setOutcome({ ...update, version: fixVersion });
      setModalOpen(false);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Could not confirm the update. Refresh before retrying.");
    } finally {
      onUpdatingChange(false);
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!result) return <p role="status" className="text-sm text-nb-ink/60">Loading tickets…</p>;
  const allSelected = result.tickets.length > 0 && selectedIds.length === result.tickets.length;

  return (
    <>
      {!modalOpen && updateError && <p role="alert" className="mb-4 text-sm text-red-700">{updateError}</p>}
      {outcome && (
        <div className="mb-4 space-y-2 text-sm">
          {outcome.updated.length > 0 && <p role="status">Set {outcome.version} on {outcome.updated.length} {outcome.updated.length === 1 ? "ticket" : "tickets"}.</p>}
          {outcome.failed.length > 0 && (
            <ul role="alert" className="space-y-1 text-red-700">
              {outcome.failed.map((failure) => (
                <li key={failure.id}>{failure.key ?? result.tickets.find((ticket) => ticket.id === failure.id)?.key ?? failure.id}: {failure.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result.tickets.length === 0 ? (
        <p role="status" className="text-sm text-nb-ink/60">No open tickets without a fix version.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(element) => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
                disabled={updating}
                onChange={(event) => setSelectedIds(event.target.checked ? result.tickets.map((ticket) => ticket.id) : [])}
                className="size-4 accent-nb-orange"
              />
              Select all
            </label>
            <span className="text-nb-ink/60">{selectedIds.length} of {result.tickets.length} selected</span>
            <button type="button" disabled={updating || !selectedIds.length} onClick={() => { setUpdateError(null); setModalOpen(true); }} className="nb-btn nb-btn-green px-4 py-2 text-sm">
              {updating ? "Updating…" : "Set fix version"}
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.tickets.map((ticket) => (
              <li key={ticket.id} className={`nb-panel-sm relative min-w-0 break-words p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-nb-orange ${selectedIds.includes(ticket.id) ? "ring-2 ring-nb-orange/40" : ""}`}>
                <TicketSelection
                  id={`fix-version-select-${ticket.id}`}
                  ticketKey={ticket.key}
                  checked={selectedIds.includes(ticket.id)}
                  disabled={updating}
                  onChange={(checked) => setSelectedIds((previous) => checked ? [...previous, ticket.id] : previous.filter((id) => id !== ticket.id))}
                />
                <a href={`${result.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(ticket.key)}`} target="_blank" rel="noreferrer" className="relative z-20 text-sm font-bold hover:underline">
                  {ticket.key} ↗
                </a>
                <p className="mt-1 text-sm text-nb-ink/80">{ticket.summary}</p>
                <span className="mt-3 block text-xs text-nb-ink/60">{ticket.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {modalOpen && (
        <FixVersionModal
          initialFixVersions={initialFixVersions}
          selectedCount={selectedIds.length}
          updating={updating}
          error={updateError}
          onClose={() => setModalOpen(false)}
          onSubmit={setSelectedFixVersions}
        />
      )}
    </>
  );
}

function FixVersionModal({ initialFixVersions, selectedCount, updating, error, onClose, onSubmit }: {
  initialFixVersions: string[] | null;
  selectedCount: number;
  updating: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (fixVersion: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fixVersion, setFixVersion] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="fix-version-modal-title"
      aria-describedby="fix-version-modal-description"
      aria-busy={updating}
      onCancel={(event) => { event.preventDefault(); if (!updating) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !updating) onClose(); }}
      className="nb-panel m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto p-0 text-nb-ink backdrop:bg-black/40"
    >
      <form className="p-6" onSubmit={(event) => { event.preventDefault(); void onSubmit(fixVersion); }}>
        <h2 id="fix-version-modal-title" className="nb-display text-lg">Set fix version</h2>
        <p id="fix-version-modal-description" className="mb-5 mt-2 text-sm text-nb-ink/60">
          Choose a fix version for {selectedCount} selected {selectedCount === 1 ? "ticket" : "tickets"}.
        </p>
        <label htmlFor="expected-fix-version" className="mb-2 block text-sm font-semibold">Fix version</label>
        <FixVersionSelect value={fixVersion} onChange={setFixVersion} initialVersions={initialFixVersions} disabled={updating} />
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={updating} onClick={onClose} className="nb-btn px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={updating || !fixVersion} className="nb-btn nb-btn-green px-4 py-2 text-sm">
            {updating ? "Updating…" : "Set fix version"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
