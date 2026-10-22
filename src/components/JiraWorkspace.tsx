"use client";

import { useEffect, useState } from "react";
import type { JiraTicket } from "@/lib/jira";

const BULK_ACTIONS = [
  "Staging deployment",
  "User Acceptance",
  "Production deployment",
];

function StagingDeploymentTickets({ fixVersion }: { fixVersion: string }) {
  const [result, setResult] = useState<{ tickets: JiraTicket[]; siteUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Wait until typing pauses, and discard requests for an older version.
    const timeout = window.setTimeout(async () => {
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
    }, 400);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [fixVersion]);

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!result) return <p role="status" className="text-sm text-nb-ink/60">Loading tickets…</p>;
  if (result.tickets.length === 0) {
    return <p role="status" className="text-sm text-nb-ink/60">No matching tickets.</p>;
  }

  return (
    <ul className="divide-y divide-nb-ink/10">
      {result.tickets.map((ticket) => (
        <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
          <div className="min-w-0 flex-1 break-words">
            <a
              href={`${result.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(ticket.key)}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold hover:underline"
            >
              {ticket.key} ↗
            </a>
            <p className="mt-1 text-sm text-nb-ink/80">{ticket.summary}</p>
          </div>
          <span className="nb-badge">{ticket.status}</span>
        </li>
      ))}
    </ul>
  );
}

export function JiraWorkspace() {
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
        <input
          id="expected-fix-version"
          type="text"
          autoComplete="off"
          value={expectedFixVersion}
          onChange={(event) => setExpectedFixVersion(event.target.value)}
          placeholder="e.g. 1.2.3"
          className="nb-input mb-6 w-full px-3 py-2 text-sm"
        />
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
              <p className="text-sm text-nb-ink/60">Enter an expected fix version to find your tickets.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
