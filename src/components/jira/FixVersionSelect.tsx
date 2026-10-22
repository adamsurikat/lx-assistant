"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function FixVersionSelect({ value, onChange, initialVersions, disabled }: {
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
