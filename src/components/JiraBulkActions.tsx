"use client";

import { useState } from "react";

const BULK_ACTIONS = [
  "Staging deployment",
  "User Acceptance",
  "Production deployment",
];

export function JiraBulkActions() {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  return (
    <aside aria-labelledby="jira-bulk-actions" className="nb-panel-sm shrink-0 p-4 md:w-64">
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
  );
}
