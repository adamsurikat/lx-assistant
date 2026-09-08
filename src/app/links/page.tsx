"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { BookmarkFolder, BookmarkNode } from "@/lib/bookmarks";

function FolderView({ folder, depth = 0 }: { folder: BookmarkFolder; depth?: number }) {
  if (folder.children.length === 0) {
    return null;
  }
  return (
    <ul className={depth > 0 ? "mt-1 space-y-1 border-l-2 border-nb-ink/10 pl-4" : "space-y-1"}>
      {folder.children.map((node: BookmarkNode, i) =>
        node.type === "folder" ? (
          <li key={`${node.title}-${i}`}>
            <details open={depth < 1} className="group">
              <summary className="cursor-pointer select-none list-none rounded px-1 py-0.5 text-sm font-bold text-nb-ink hover:bg-nb-orange/10">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                  ▸
                </span>
                {node.title || "(untitled folder)"}
              </summary>
              <FolderView folder={node} depth={depth + 1} />
            </details>
          </li>
        ) : (
          <li key={`${node.url}-${i}`}>
            <a
              href={node.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate rounded px-1 py-0.5 text-sm font-medium text-nb-ink/80 hover:bg-nb-orange/10 hover:text-nb-ink"
              title={node.url}
            >
              🔗 {node.title}
            </a>
          </li>
        )
      )}
    </ul>
  );
}

export default function LinksPage() {
  const [root, setRoot] = useState<BookmarkFolder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bookmarks")
      .then((res) => res.json())
      .then((data) => setRoot(data.root))
      .catch(() => setError("Failed to load bookmarks."));
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="links" />
      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <div className="border-b border-nb-ink/10 bg-white px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Links</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-sm font-medium text-nb-pink">{error}</p>}
          {!error && !root && (
            <p className="text-sm font-medium text-nb-ink/50">Loading…</p>
          )}
          {!error && root && root.children.length === 0 && (
            <p className="text-sm font-medium text-nb-ink/50">
              No bookmarks found. Export your browser bookmarks to{" "}
              <code className="nb-badge">bookmarks.html</code> in the project root.
            </p>
          )}
          {!error && root && root.children.length > 0 && <FolderView folder={root} />}
        </div>
      </div>
    </div>
  );
}
