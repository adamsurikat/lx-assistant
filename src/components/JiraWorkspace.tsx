"use client";

import { ReleaseCycleTool } from "./jira/ReleaseCycleTool";

export function JiraWorkspace({ initialFixVersions }: { initialFixVersions: string[] | null }) {
  return (
    <main aria-label="Jira workspace" className="nb-panel-sm m-3 flex min-w-0 flex-1 flex-col overflow-hidden bg-nb-paper">
      <div role="tablist" aria-label="Jira tools" className="flex shrink-0 flex-wrap gap-4 border-b border-nb-ink/10 bg-white px-4">
        <button
          id="jira-release-cycle-tab"
          type="button"
          role="tab"
          aria-selected="true"
          aria-controls="jira-release-cycle-panel"
          className="-mb-px border-b-4 border-nb-orange px-1 py-3 text-sm font-bold text-nb-ink transition-colors"
        >
          Release cycle
        </button>
      </div>
      <div
        id="jira-release-cycle-panel"
        role="tabpanel"
        aria-labelledby="jira-release-cycle-tab"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto bg-white p-4 md:p-6"
      >
        <ReleaseCycleTool initialFixVersions={initialFixVersions} />
      </div>
    </main>
  );
}
