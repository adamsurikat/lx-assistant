"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { JiraTicket } from "@/lib/jira";
import { groupStagingTickets, type StagingColumn } from "@/lib/jiraStaging";

const BULK_ACTIONS = [
  "Staging deployment",
  "User Acceptance",
  "Production deployment",
];

const STAGING_COLUMNS: { id: StagingColumn; title: string }[] = [
  { id: "before", title: "Before acceptance" },
  { id: "ready", title: "Ready for Acceptance" },
  { id: "after", title: "After acceptance" },
];

function FixVersionSelect({ value, onChange, initialVersions }: {
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  initialVersions: string[] | null;
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
        disabled={!versions?.length}
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

function StagingDeploymentTickets({ fixVersion }: { fixVersion: string }) {
  const [result, setResult] = useState<{ tickets: JiraTicket[]; siteUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        if (!response.ok) throw new Error(data.error || "Could not load staging tickets.");
        if (!controller.signal.aborted) setResult(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load staging tickets.");
        }
      }
    }
    void loadTickets();
    return () => controller.abort();
  }, [fixVersion]);

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!result) return <p role="status" className="text-sm text-nb-ink/60">Loading tickets…</p>;
  const columns = groupStagingTickets(result.tickets);

  return (
    <>
      {result.tickets.length === 0 && (
        <p role="status" className="mb-4 text-sm text-nb-ink/60">No matching tickets.</p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {STAGING_COLUMNS.map(({ id, title }) => (
          <section
            key={id}
            aria-labelledby={`staging-${id}`}
            className={`min-w-0 rounded-xl border p-3 ${id === "ready" ? "border-nb-green/40 bg-nb-green/10" : "border-nb-ink/10 bg-nb-ink/[0.02]"}`}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 id={`staging-${id}`} className="text-sm font-semibold">{title}</h3>
              <span className="nb-badge shrink-0" aria-label={`${columns[id].length} tickets`}>{columns[id].length}</span>
            </div>
            {columns[id].length === 0 ? (
              <p className="text-sm text-nb-ink/60">No tickets.</p>
            ) : (
              <ul className="space-y-3">
                {columns[id].map((ticket) => (
                  <li key={ticket.id} className="nb-panel-sm min-w-0 break-words p-3">
                    <a
                      href={`${result.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(ticket.key)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold hover:underline"
                    >
                      {ticket.key} ↗
                    </a>
                    <p className="mt-1 text-sm text-nb-ink/80">{ticket.summary}</p>
                    <span className="nb-badge mt-3">{ticket.status}</span>
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
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [expectedFixVersion, setExpectedFixVersion] = useState("");
  const [refresh, setRefresh] = useState(0);
  const fixVersion = expectedFixVersion.trim();

  return (
    <div className="m-3 flex flex-1 flex-col gap-3 md:flex-row">
      <aside aria-labelledby="jira-bulk-actions" className="nb-panel-sm shrink-0 p-4 md:w-64">
        <label htmlFor="expected-fix-version" className="mb-2 block text-sm font-semibold">
          Expected fix version
        </label>
        <FixVersionSelect value={expectedFixVersion} onChange={setExpectedFixVersion} initialVersions={initialFixVersions} />
        <h2 id="jira-bulk-actions" className="nb-display mb-3 text-lg">Bulk actions</h2>
        <div className="flex flex-col gap-2">
          {BULK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              aria-pressed={selectedAction === action}
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
        {selectedAction === "Staging deployment" && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="nb-display text-xl">Staging deployment</h2>
              {fixVersion && (
                <button type="button" className="nb-btn px-3 py-2 text-sm" onClick={() => setRefresh((value) => value + 1)}>
                  Refresh
                </button>
              )}
            </div>
            {fixVersion ? (
              <StagingDeploymentTickets key={`${fixVersion}:${refresh}`} fixVersion={fixVersion} />
            ) : (
              <p className="text-sm text-nb-ink/60">Select an expected fix version to find your tickets.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
