"use client";

import { useState } from "react";
import { ReleaseCycleTool } from "./jira/ReleaseCycleTool";
import { FixVersionTool } from "./jira/FixVersionTool";

const TOOLS = [
  { key: "release-cycle", name: "Release cycle", Component: ReleaseCycleTool },
  { key: "fix-version", name: "Fix version", Component: FixVersionTool },
] as const;

export function JiraWorkspace({ initialFixVersions }: { initialFixVersions: string[] | null }) {
  const [selectedKey, setSelectedKey] = useState<string>(TOOLS[0].key);
  const [updating, setUpdating] = useState(false);
  const selected = TOOLS.find((tool) => tool.key === selectedKey) ?? TOOLS[0];
  const SelectedComponent = selected.Component;

  return (
    <main aria-label="Jira workspace" className="nb-panel-sm m-3 flex min-w-0 flex-1 flex-col overflow-hidden bg-nb-paper">
      <div role="tablist" aria-label="Jira tools" className="flex shrink-0 flex-wrap gap-4 border-b border-nb-ink/10 bg-white px-4">
        {TOOLS.map((tool, index) => (
          <button
            key={tool.key}
            id={`jira-${tool.key}-tab`}
            type="button"
            role="tab"
            aria-selected={selected.key === tool.key}
            aria-controls={`jira-${tool.key}-panel`}
            tabIndex={selected.key === tool.key ? 0 : -1}
            disabled={updating}
            onClick={() => setSelectedKey(tool.key)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % TOOLS.length
                : event.key === "ArrowLeft" ? (index + TOOLS.length - 1) % TOOLS.length
                : event.key === "Home" ? 0 : event.key === "End" ? TOOLS.length - 1 : null;
              if (next === null || updating) return;
              event.preventDefault();
              setSelectedKey(TOOLS[next].key);
              document.getElementById(`jira-${TOOLS[next].key}-tab`)?.focus();
            }}
            className={`-mb-px border-b-4 px-1 py-3 text-sm font-bold transition-colors ${selected.key === tool.key
              ? "border-nb-orange text-nb-ink" : "border-transparent text-nb-ink/50 hover:text-nb-ink"}`}
          >
            {tool.name}
          </button>
        ))}
      </div>
      <div
        key={selected.key}
        id={`jira-${selected.key}-panel`}
        role="tabpanel"
        aria-labelledby={`jira-${selected.key}-tab`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto bg-white p-4 md:p-6"
      >
        <SelectedComponent initialFixVersions={initialFixVersions} updating={updating} onUpdatingChange={setUpdating} />
      </div>
    </main>
  );
}
