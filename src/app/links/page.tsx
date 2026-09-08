"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { BookmarkFolder, BookmarkNode } from "@/lib/bookmarks";
import { buildServiceGrid } from "@/lib/bookmarkGrid";

function ServiceCard({ folder }: { folder: BookmarkFolder }) {
  const grid = buildServiceGrid(folder);
  const hasGrid = grid.environments.length > 0 && grid.tenants.length > 0;

  return (
    <div className="nb-panel-sm bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-nb-ink">{grid.title}</h3>

      {hasGrid && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-0" />
                {grid.environments.map((env) => (
                  <th
                    key={env}
                    className="px-2 pb-2 text-center text-xs font-semibold uppercase tracking-wide text-nb-ink/50"
                  >
                    {env}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.tenants.map((tenant) => (
                <tr key={tenant}>
                  <th className="whitespace-nowrap pr-3 text-left text-xs font-semibold text-nb-ink/50">
                    {tenant}
                  </th>
                  {grid.environments.map((env) => {
                    const link = grid.cells[tenant]?.[env];
                    return (
                      <td key={env} className="p-1 text-center">
                        {link ? (
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            title={link.url}
                            className="nb-btn nb-btn-orange block px-3 py-1.5 text-xs font-semibold"
                          >
                            {env}
                          </a>
                        ) : (
                          <span className="block px-3 py-1.5 text-xs text-nb-ink/20">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {grid.other.length > 0 && (
        <ul className={hasGrid ? "mt-3 space-y-1 border-t border-nb-ink/10 pt-3" : "space-y-1"}>
          {grid.other.map((link, i) => (
            <li key={`${link.url}-${i}`}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                title={link.url}
                className="block truncate rounded px-1 py-0.5 text-sm font-medium text-nb-ink/80 hover:bg-nb-orange/10 hover:text-nb-ink"
              >
                🔗 {link.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
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

  // Folders become service grids; any bookmark that isn't inside a folder
  // (unusual for a toolbar export, but possible) is rendered as a plain link
  // below the grids instead of being dropped.
  const folders = (root?.children ?? []).filter(
    (n: BookmarkNode): n is BookmarkFolder => n.type === "folder"
  );
  const looseLinks = (root?.children ?? []).filter((n: BookmarkNode) => n.type === "link");

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
          {!error && root && folders.length === 0 && looseLinks.length === 0 && (
            <p className="text-sm font-medium text-nb-ink/50">
              No bookmarks found. Export your browser bookmarks to{" "}
              <code className="nb-badge">bookmarks.html</code> in the project root.
            </p>
          )}
          {!error && folders.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {folders.map((folder, i) => (
                <ServiceCard key={`${folder.title}-${i}`} folder={folder} />
              ))}
            </div>
          )}
          {!error && looseLinks.length > 0 && (
            <ul className="mt-4 space-y-1">
              {looseLinks.map((node, i) => {
                const link = node as Extract<BookmarkNode, { type: "link" }>;
                return (
                  <li key={`${link.url}-${i}`}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      title={link.url}
                      className="block truncate rounded px-1 py-0.5 text-sm font-medium text-nb-ink/80 hover:bg-nb-orange/10 hover:text-nb-ink"
                    >
                      🔗 {link.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
