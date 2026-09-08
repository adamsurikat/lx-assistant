"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { BookmarkFolder, BookmarkNode } from "@/lib/bookmarks";
import { buildServiceGrid, type GridCell } from "@/lib/bookmarkGrid";

function GridCellButton({ env, cell }: { env: string; cell: GridCell }) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setAnchor(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAnchor(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (cell.backendVariants.length === 0) {
    return (
      <a
        href={cell.primary.url}
        target="_blank"
        rel="noreferrer"
        title={cell.primary.url}
        className="nb-btn nb-btn-orange block px-3 py-1.5 text-xs font-semibold"
      >
        {env}
      </a>
    );
  }

  // Multiple backends are available for this frontend/tenant/env combo
  // (e.g. a local frontend that can point at FAT/Staging/Prod) — open a
  // popover to choose instead of always following `primary`. Positioned
  // `fixed` (anchored to the button's own rect) rather than `absolute` so it
  // isn't clipped by the card's horizontally-scrollable table wrapper.
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            setAnchor(null);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setAnchor({ left: rect.left + rect.width / 2, top: rect.bottom + 4 });
        }}
        className="nb-btn nb-btn-orange flex items-center gap-1 px-3 py-1.5 text-xs font-semibold"
      >
        {env}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {anchor && (
        <div
          ref={popoverRef}
          className="nb-panel-sm fixed z-50 w-44 -translate-x-1/2 bg-white p-1.5 text-left"
          style={{ left: anchor.left, top: anchor.top }}
        >
          <p className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-nb-ink/40">
            Choose backend
          </p>
          <a
            href={cell.primary.url}
            target="_blank"
            rel="noreferrer"
            title={cell.primary.url}
            onClick={() => setAnchor(null)}
            className="block truncate rounded px-2 py-1 text-xs font-semibold text-nb-ink hover:bg-nb-orange/10"
          >
            {env} (default)
          </a>
          {cell.backendVariants.map((variant) => (
            <a
              key={variant.backend}
              href={variant.link.url}
              target="_blank"
              rel="noreferrer"
              title={variant.link.url}
              onClick={() => setAnchor(null)}
              className="block truncate rounded px-2 py-1 text-xs font-medium text-nb-ink/80 hover:bg-nb-orange/10 hover:text-nb-ink"
            >
              → {variant.backend}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function ServiceCard({ folder }: { folder: BookmarkFolder }) {
  const grid = buildServiceGrid(folder);
  const hasGrid = grid.environments.length > 0 && grid.tenants.length > 0;

  return (
    <div className="nb-panel-sm bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-nb-ink">{grid.title}</h3>

      {hasGrid && (
        <div>
          <table className="w-full border-collapse text-sm">
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
                    const cell = grid.cells[tenant]?.[env];
                    return (
                      <td key={env} className="p-1 text-center">
                        {cell ? (
                          <GridCellButton env={env} cell={cell} />
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
