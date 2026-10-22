"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { JiraTicket } from "@/lib/jira";
import type { StagingUpdateResult } from "@/lib/jiraStaging";
import { groupJiraBoardTickets, type JiraBoardColumn } from "@/lib/jiraBoard";

const BOARD_COLUMNS: { id: JiraBoardColumn; title: string }[] = [
  { id: "before", title: "Before acceptance" },
  { id: "acceptance", title: "Waiting for acceptance" },
  { id: "release", title: "Resolved / Ready for Release" },
  { id: "done", title: "Done / Closed" },
];

const BOARD_ACTIONS = {
  before: { endpoint: "/api/jira/staging-tickets", targetLabel: "Ready for Acceptance" },
  release: { endpoint: "/api/jira/production-tickets", targetLabel: "Done/Closed" },
};

function FixVersionSelect({ value, onChange, initialVersions, disabled }: {
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  initialVersions: string[] | null;
  disabled: boolean;
}) {
  const [versions, setVersions] = useState<string[] | null>(initialVersions);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    async function loadVersions() {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("/api/jira/fix-versions", {
          method: "POST", signal: controller.signal, cache: "no-store",
        });
        if (response.redirected) throw new Error("Your session expired. Sign in again to load versions.");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load fix versions.");
        if (!controller.signal.aborted) {
          setVersions(data.versions);
          setError(null);
          onChange((selected) => data.versions.includes(selected) ? selected : "");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load fix versions.");
        }
      } finally {
        refreshing = false;
      }
    }
    void loadVersions();
    const interval = window.setInterval(() => void loadVersions(), 5 * 60_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [attempt, onChange]);

  return (
    <div>
      <select
        id="expected-fix-version"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || !versions?.length}
        aria-describedby={error ? "fix-versions-error" : undefined}
        className="nb-input w-full px-3 py-2 text-sm disabled:opacity-60"
      >
        <option value="">
          {versions === null ? (error ? "Could not load versions" : "Loading versions…") : versions.length ? "Select fix version" : "No fix versions found"}
        </option>
        {versions?.map((version) => <option key={version} value={version}>{version}</option>)}
      </select>
      {error && (
        <div className="mt-2 text-sm">
          <p id="fix-versions-error" role="alert" className="text-red-700">
            {versions !== null ? `Saved versions are still available. ${error}` : error}
          </p>
          <button type="button" className="mt-1 font-semibold underline" onClick={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function JiraTicketBoard({ fixVersion, updating, onUpdatingChange }: {
  fixVersion: string;
  updating: boolean;
  onUpdatingChange: (updating: boolean) => void;
}) {
  const [result, setResult] = useState<{ tickets: JiraTicket[]; siteUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [updateResult, setUpdateResult] = useState<(StagingUpdateResult & { targetLabel: string }) | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTickets() {
      try {
        const response = await fetch(`/api/jira/staging-tickets?${new URLSearchParams({ fixVersion })}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.redirected) throw new Error("Your session expired. Sign in again to load tickets.");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load tickets.");
        if (!controller.signal.aborted) setResult(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load tickets.");
        }
      }
    }
    void loadTickets();
    return () => controller.abort();
  }, [fixVersion]);

  async function moveSelectedTickets(column: keyof typeof BOARD_ACTIONS) {
    if (updating || !result) return;
    const action = BOARD_ACTIONS[column];
    const ticketIds = groupJiraBoardTickets(result.tickets)[column]
      .filter((ticket) => selectedIds.includes(ticket.id)).map((ticket) => ticket.id);
    if (!ticketIds.length) return;
    onUpdatingChange(true);
    setUpdateResult(null);
    setUpdateError(null);
    try {
      const response = await fetch(action.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixVersion, ticketIds }),
      });
      if (response.redirected) throw new Error("Your session expired. Sign in again to update tickets.");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update tickets. Refresh before retrying.");
      const outcome: StagingUpdateResult = data;
      const updated = new Map(outcome.updated.map((ticket) => [ticket.id, ticket]));
      // Apply confirmed transitions immediately; Jira search can lag updates.
      setResult((previous) => previous && {
        ...previous, tickets: previous.tickets.map((ticket) => updated.get(ticket.id) ?? ticket),
      });
      setSelectedIds((previous) => previous.filter((id) => !updated.has(id)));
      setUpdateResult({ ...outcome, targetLabel: action.targetLabel });
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Could not confirm the update. Refresh before retrying.");
    } finally {
      onUpdatingChange(false);
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!result) return <p role="status" className="text-sm text-nb-ink/60">Loading tickets…</p>;
  const columns = groupJiraBoardTickets(result.tickets);

  return (
    <>
      {updateError && <p role="alert" className="mb-4 text-sm text-red-700">{updateError}</p>}
      {updateResult && (
        <div className="mb-4 space-y-2 text-sm">
          {updateResult.updated.length > 0 && (
            <p role="status">{updateResult.updated.length} {updateResult.updated.length === 1 ? "ticket is" : "tickets are"} now {updateResult.targetLabel}.</p>
          )}
          {updateResult.failed.length > 0 && (
            <ul role="alert" className="space-y-1 text-red-700">
              {updateResult.failed.map((failure) => (
                <li key={failure.id}>{failure.key ?? result.tickets.find((ticket) => ticket.id === failure.id)?.key ?? failure.id}: {failure.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {Object.values(columns).every((tickets) => tickets.length === 0) && (
        <p role="status" className="mb-4 text-sm text-nb-ink/60">No matching tickets.</p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {BOARD_COLUMNS.map(({ id, title }) => {
          const actionColumn = id === "before" || id === "release" ? id : null;
          const selectedCount = columns[id].filter((ticket) => selectedIds.includes(ticket.id)).length;
          const allSelected = columns[id].length > 0 && selectedCount === columns[id].length;
          return (
            <section
              key={id}
              aria-labelledby={`deployment-${id}`}
              className={`min-w-0 rounded-xl border p-3 ${id === "done" ? "border-nb-green/40 bg-nb-green/10" : "border-nb-ink/10 bg-nb-ink/[0.02]"}`}
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <h3 id={`deployment-${id}`} className="text-sm font-semibold">{title}</h3>
                <span className="nb-badge shrink-0" aria-label={`${columns[id].length} tickets`}>{columns[id].length}</span>
              </div>
              {actionColumn && columns[id].length > 0 && (
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(element) => { if (element) element.indeterminate = selectedCount > 0 && !allSelected; }}
                        disabled={updating}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          const columnIds = new Set(columns[id].map((ticket) => ticket.id));
                          setSelectedIds((previous) => [
                            ...previous.filter((ticketId) => !columnIds.has(ticketId)),
                            ...(checked ? [...columnIds] : []),
                          ]);
                        }}
                        className="size-4 accent-nb-orange"
                      />
                      Select all
                    </label>
                    <span className="text-nb-ink/60">{selectedCount} selected</span>
                  </div>
                  <button
                    type="button"
                    disabled={updating || selectedCount === 0}
                    onClick={() => void moveSelectedTickets(actionColumn)}
                    className="nb-btn nb-btn-green w-full px-3 py-2 text-sm"
                  >
                    {updating ? "Updating…" : `Move to ${BOARD_ACTIONS[actionColumn].targetLabel}`}
                  </button>
                </div>
              )}
              {columns[id].length === 0 ? (
                <p className="text-sm text-nb-ink/60">No tickets.</p>
              ) : (
                <ul className="space-y-3">
                  {columns[id].map((ticket) => (
                    <li
                      key={ticket.id}
                      className={`nb-panel-sm relative min-w-0 break-words p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-nb-orange ${
                        actionColumn && selectedIds.includes(ticket.id) ? "ring-2 ring-nb-orange/40" : ""
                      }`}
                    >
                      {actionColumn && (
                        <>
                          <label
                            htmlFor={`deployment-select-${ticket.id}`}
                            className={`absolute inset-0 z-10 rounded-[inherit] ${updating ? "cursor-default" : "cursor-pointer"}`}
                          >
                            <span className="sr-only">Select {ticket.key}</span>
                          </label>
                          <input
                            id={`deployment-select-${ticket.id}`}
                            type="checkbox"
                            checked={selectedIds.includes(ticket.id)}
                            disabled={updating}
                            onChange={(event) => setSelectedIds((previous) => event.target.checked
                              ? [...previous, ticket.id] : previous.filter((id) => id !== ticket.id))}
                            className="relative z-20 mr-2 size-4 align-middle accent-nb-orange"
                          />
                        </>
                      )}
                      <a
                        href={`${result.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(ticket.key)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="relative z-20 text-sm font-bold hover:underline"
                      >
                        {ticket.key} ↗
                      </a>
                      <p className="mt-1 text-sm text-nb-ink/80">{ticket.summary}</p>
                      <span className="mt-3 block text-xs text-nb-ink/60">{ticket.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function ReleaseCycleTool({ initialFixVersions }: { initialFixVersions: string[] | null }) {
  const [expectedFixVersion, setExpectedFixVersion] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updating, setUpdating] = useState(false);
  const fixVersion = expectedFixVersion.trim();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="w-full sm:w-72">
          <label htmlFor="expected-fix-version" className="mb-2 block text-sm font-semibold">
            Fix version
          </label>
          <FixVersionSelect value={expectedFixVersion} onChange={setExpectedFixVersion} initialVersions={initialFixVersions} disabled={updating} />
        </div>
        {fixVersion && (
          <button type="button" disabled={updating} className="nb-btn px-3 py-2 text-sm" onClick={() => setRefresh((value) => value + 1)}>
            Refresh
          </button>
        )}
      </div>
      {fixVersion ? (
        <JiraTicketBoard key={`${fixVersion}:${refresh}`} fixVersion={fixVersion} updating={updating} onUpdatingChange={setUpdating} />
      ) : (
        <p className="text-sm text-nb-ink/60">Select a fix version to view your tickets.</p>
      )}
    </div>
  );
}
