"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { JiraTicket } from "@/lib/jira";
import { groupStagingTickets, groupUserAcceptanceTickets, groupProductionDeploymentTickets, type StagingColumn, type StagingUpdateResult } from "@/lib/jiraStaging";

const BULK_ACTIONS = [
  "Staging deployment",
  "User Acceptance",
  "Production deployment",
] as const;

type BulkAction = (typeof BULK_ACTIONS)[number];

const STAGING_COLUMNS: { id: StagingColumn; title: string }[] = [
  { id: "before", title: "Before acceptance" },
  { id: "ready", title: "Ready for Acceptance" },
  { id: "after", title: "After acceptance" },
];

const USER_ACCEPTANCE_COLUMNS: { id: StagingColumn; title: string }[] = [
  { id: "before", title: "Ready for Acceptance" },
  { id: "ready", title: "Resolved / Ready for Release" },
  { id: "after", title: "After user acceptance" },
];

const PRODUCTION_COLUMNS: { id: StagingColumn; title: string }[] = [
  { id: "before", title: "Ready for Release / Resolved" },
  { id: "ready", title: "Closed / Done" },
];

const DEPLOYMENT_VIEWS = {
  "Staging deployment": { columns: STAGING_COLUMNS, groupTickets: groupStagingTickets },
  "User Acceptance": { columns: USER_ACCEPTANCE_COLUMNS, groupTickets: groupUserAcceptanceTickets },
  "Production deployment": { columns: PRODUCTION_COLUMNS, groupTickets: groupProductionDeploymentTickets },
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
    <div className="mb-6">
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

function JiraDeploymentTickets({ action, fixVersion, updating, onUpdatingChange }: {
  action: BulkAction;
  fixVersion: string;
  updating: boolean;
  onUpdatingChange: (updating: boolean) => void;
}) {
  const isStaging = action === "Staging deployment";
  const view = DEPLOYMENT_VIEWS[action];
  const [result, setResult] = useState<{ tickets: JiraTicket[]; siteUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [updateResult, setUpdateResult] = useState<StagingUpdateResult | null>(null);
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

  async function moveSelectedTickets() {
    if (!isStaging || updating || !selectedIds.length) return;
    onUpdatingChange(true);
    setUpdateResult(null);
    setUpdateError(null);
    try {
      const response = await fetch("/api/jira/staging-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixVersion, ticketIds: selectedIds }),
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
      setUpdateResult(outcome);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Could not confirm the update. Refresh before retrying.");
    } finally {
      onUpdatingChange(false);
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!result) return <p role="status" className="text-sm text-nb-ink/60">Loading tickets…</p>;
  const columns = view.groupTickets(result.tickets);
  const allSelected = columns.before.length > 0 && selectedIds.length === columns.before.length;

  return (
    <>
      {updateError && <p role="alert" className="mb-4 text-sm text-red-700">{updateError}</p>}
      {updateResult && (
        <div className="mb-4 space-y-2 text-sm">
          {updateResult.updated.length > 0 && (
            <p role="status">{updateResult.updated.length} {updateResult.updated.length === 1 ? "ticket is" : "tickets are"} now Ready for Acceptance.</p>
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
      <div className={`grid grid-cols-1 gap-4 ${view.columns.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {view.columns.map(({ id, title }) => (
          <section
            key={id}
            aria-labelledby={`deployment-${id}`}
            className={`min-w-0 rounded-xl border p-3 ${id === "ready" ? "border-nb-green/40 bg-nb-green/10" : "border-nb-ink/10 bg-nb-ink/[0.02]"}`}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 id={`deployment-${id}`} className="text-sm font-semibold">{title}</h3>
              <span className="nb-badge shrink-0" aria-label={`${columns[id].length} tickets`}>{columns[id].length}</span>
            </div>
            {isStaging && id === "before" && columns.before.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(element) => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
                      disabled={updating}
                      onChange={(event) => setSelectedIds(event.target.checked ? columns.before.map((ticket) => ticket.id) : [])}
                      className="size-4 accent-nb-orange"
                    />
                    Select all
                  </label>
                  <span className="text-nb-ink/60">{selectedIds.length} selected</span>
                </div>
                <button
                  type="button"
                  disabled={updating || selectedIds.length === 0}
                  onClick={() => void moveSelectedTickets()}
                  className="nb-btn nb-btn-green w-full px-3 py-2 text-sm"
                >
                  {updating ? "Updating…" : "Move to Ready for Acceptance"}
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
                      isStaging && id === "before" && selectedIds.includes(ticket.id) ? "ring-2 ring-nb-orange/40" : ""
                    }`}
                  >
                    {isStaging && id === "before" && (
                      <>
                        <label
                          htmlFor={`staging-select-${ticket.id}`}
                          className={`absolute inset-0 z-10 rounded-[inherit] ${updating ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <span className="sr-only">Select {ticket.key}</span>
                        </label>
                        <input
                          id={`staging-select-${ticket.id}`}
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
        ))}
      </div>
    </>
  );
}

export function JiraWorkspace({ initialFixVersions }: { initialFixVersions: string[] | null }) {
  const [selectedAction, setSelectedAction] = useState<BulkAction | null>(null);
  const [expectedFixVersion, setExpectedFixVersion] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updating, setUpdating] = useState(false);
  const fixVersion = expectedFixVersion.trim();

  return (
    <div className="m-3 flex flex-1 flex-col gap-3 md:flex-row">
      <aside aria-labelledby="jira-bulk-actions" className="nb-panel-sm shrink-0 p-4 md:w-64">
        <label htmlFor="expected-fix-version" className="mb-2 block text-sm font-semibold">
          Expected fix version
        </label>
        <FixVersionSelect value={expectedFixVersion} onChange={setExpectedFixVersion} initialVersions={initialFixVersions} disabled={updating} />
        <h2 id="jira-bulk-actions" className="nb-display mb-3 text-lg">Bulk actions</h2>
        <div className="flex flex-col gap-2">
          {BULK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              aria-pressed={selectedAction === action}
              disabled={updating}
              onClick={() => setSelectedAction(action)}
              className={`rounded-lg px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nb-orange ${
                selectedAction === action
                  ? "bg-nb-orange/10 text-nb-ink"
                  : "text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink"
              }`}
            >
              {action}
            </button>
          ))}
        </div>
      </aside>
      <main aria-label="Jira workspace" className="nb-panel-sm min-h-64 min-w-0 flex-1 p-4 md:p-6">
        {selectedAction && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="nb-display text-xl">{selectedAction}</h2>
              {fixVersion && (
                <button type="button" disabled={updating} className="nb-btn px-3 py-2 text-sm" onClick={() => setRefresh((value) => value + 1)}>
                  Refresh
                </button>
              )}
            </div>
            {fixVersion ? (
              <JiraDeploymentTickets key={`${selectedAction}:${fixVersion}:${refresh}`} action={selectedAction} fixVersion={fixVersion} updating={updating} onUpdatingChange={setUpdating} />
            ) : (
              <p className="text-sm text-nb-ink/60">Select an expected fix version to find your tickets.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
