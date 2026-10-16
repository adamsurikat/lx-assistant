"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AppHeader } from "@/components/AppHeader";
import { LINK_FOLDERS, type BookmarkFolder, type BookmarkLink } from "@/lib/linksData";
import { buildServiceGrid, type GridCell } from "@/lib/bookmarkGrid";
import { isValidLinkCardOrder, normalizeLinkCardOrder } from "@/lib/linksLayout";

function GridCellButton({ env, cell }: { env: string; cell: GridCell }) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useLayoutEffect(() => {
    if (!open) return;
    const positionPopover = () => {
      const button = buttonRef.current;
      const popover = popoverRef.current;
      if (!button || !popover) return;
      const rect = button.getBoundingClientRect();
      const { width, height } = popover.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin + width / 2, Math.min(rect.left + rect.width / 2, window.innerWidth - margin - width / 2));
      const top = rect.bottom + 4 + height <= window.innerHeight - margin
        ? rect.bottom + 4
        : Math.max(margin, rect.top - height - 4);
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };
    positionPopover();
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open]);

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
    // Resizing reflows the cards, so dismiss any menu attached to their old position.
    const handleResize = () => setAnchor(null);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  if (!cell.frontendChoices && cell.backendVariants.length === 0) {
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

  const choices = cell.frontendChoices
    ? cell.frontendChoices.map(({ frontend, link }) => ({ environment: frontend, link }))
    : [
      { environment: env, link: cell.primary },
      ...cell.backendVariants.map(({ backend, link }) => ({ environment: backend, link })),
    ];

  // Anchor the chooser to its button without clipping it inside the table's
  // horizontal scrolling area. LX React Client chooses frontends here;
  // other service cards keep their backend choices.
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        title={cell.frontendChoices ? `Choose frontend for ${env} backend` : `Choose backend for ${env} frontend`}
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
          className="nb-panel-sm fixed z-50 max-h-[calc(100dvh-1rem)] w-44 -translate-x-1/2 overflow-y-auto bg-white p-1.5 text-left"
          style={{ left: anchor.left, top: anchor.top }}
        >
          <p className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-nb-ink/40">
            Choose {cell.frontendChoices ? "frontend" : "backend"}
          </p>
          {choices.map((choice) => (
            <a
              key={`${choice.environment}-${choice.link.url}`}
              href={choice.link.url}
              target="_blank"
              rel="noreferrer"
              title={choice.link.url}
              onClick={() => setAnchor(null)}
              className={`block truncate rounded px-2 py-1 text-xs hover:bg-nb-orange/10 hover:text-nb-ink ${choice.environment === env ? "font-semibold text-nb-ink" : "font-medium text-nb-ink/80"}`}
            >
              {!cell.frontendChoices && choice.environment !== env ? "→ " : ""}{choice.environment}{choice.environment === env ? " (default)" : ""}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function BookmarkButtons({ links, className = "", neutral = false }: { links: BookmarkLink[]; className?: string; neutral?: boolean }) {
  return (
    <ul className={`flex flex-row flex-wrap gap-3 ${className}`}>
      {links.map((link, i) => (
        <li key={`${link.url}-${i}`}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            title={link.url}
            className={`nb-btn px-3 py-1.5 text-xs font-semibold ${neutral ? "hover:bg-nb-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nb-ink/50" : "nb-btn-orange"}`}
          >
            {neutral && link.icon && (
              <Image src={link.icon} alt="" width={16} height={16} unoptimized className="h-4 w-4 shrink-0 object-contain" />
            )}
            {link.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function ServiceCard({ folder, controls }: { folder: BookmarkFolder; controls?: ReactNode }) {
  const grid = buildServiceGrid(folder);
  const hasGrid = folder.layout !== "list" && grid.environments.length > 0 && grid.tenants.length > 0;
  const links = folder.layout === "list"
    ? folder.children.filter((node): node is BookmarkLink => node.type === "link")
    : grid.other;

  return (
    <div className="nb-panel-sm min-w-0 w-full bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-nb-ink">{grid.title}</h3>
        {controls}
      </div>

      {hasGrid && (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-0 pb-3 pr-4 text-left text-xs font-semibold text-nb-ink/50">
                  {folder.id === "lx-react-client" ? "Backend" : null}
                </th>
                {grid.environments.map((env) => (
                  <th
                    key={env}
                    className="px-3 pb-3 text-center text-xs font-semibold uppercase tracking-wide text-nb-ink/50"
                  >
                    {env}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.tenants.map((tenant) => (
                <tr key={tenant}>
                  <th className="whitespace-nowrap pr-4 text-left text-xs font-semibold text-nb-ink/50">
                    {tenant}
                  </th>
                  {grid.environments.map((env) => {
                    const cell = grid.cells[tenant]?.[env];
                    return (
                      <td key={env} className="px-2 py-1.5 text-center">
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

      {links.length > 0 && (
        <BookmarkButtons
          links={links}
          neutral={folder.layout === "list"}
          className={hasGrid ? "mt-3 border-t border-nb-ink/10 pt-3" : ""}
        />
      )}
    </div>
  );
}

interface Reordering {
  disabled: boolean;
  move: (id: string, direction: -1 | 1) => void;
  drop: (id: string, targetId: string, after: boolean) => void;
}

function ServiceMasonry({ folders, reordering }: { folders: BookmarkFolder[]; reordering: Reordering }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const touchDrag = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
    target: { id: string; after: boolean } | null;
  } | null>(null);
  const endDrag = () => {
    touchDrag.current = null;
    setDraggedId(null);
    setDropTarget(null);
  };

  return (
    <div className="columns-[36rem] gap-5">
      <p id="link-card-drag-help" className="sr-only">Drag to reorder, or use the up and down arrow keys while focused on a drag handle. Changes save automatically.</p>
      {folders.map((folder) => (
        <div
          key={folder.id}
          data-card-id={folder.id}
          className={`relative mb-5 inline-block w-full break-inside-avoid align-top ${draggedId === folder.id ? "opacity-50" : ""} ${dropTarget?.id === folder.id ? "rounded-xl outline-2 outline-offset-2 outline-nb-orange" : ""}`}
          onDragOver={(event) => {
            if (reordering.disabled || !draggedId || draggedId === folder.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const rect = event.currentTarget.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            setDropTarget((previous) => previous?.id === folder.id && previous.after === after ? previous : { id: folder.id, after });
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
              setDropTarget((previous) => previous?.id === folder.id ? null : previous);
            }
          }}
          onDrop={(event) => {
            if (reordering.disabled || !draggedId || draggedId === folder.id) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            reordering.drop(draggedId, folder.id, event.clientY > rect.top + rect.height / 2);
            endDrag();
          }}
        >
          {dropTarget?.id === folder.id && (
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 h-1 rounded-full bg-nb-orange ${dropTarget.after ? "-bottom-2.5" : "-top-2.5"}`} />
          )}
          <ServiceCard
            folder={folder}
            controls={
              <button
                type="button"
                draggable={!reordering.disabled}
                aria-disabled={reordering.disabled}
                aria-label={`Drag ${folder.title} to reorder`}
                aria-describedby="link-card-drag-help"
                title="Drag to reorder"
                className="inline-flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded bg-transparent cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nb-ink/50 aria-disabled:cursor-default aria-disabled:opacity-50"
                onDragStart={(event) => {
                  if (reordering.disabled || touchDrag.current) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-lx-link-card", folder.id);
                  setDraggedId(folder.id);
                }}
                onDragEnd={endDrag}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  if (!reordering.disabled) reordering.move(folder.id, event.key === "ArrowUp" ? -1 : 1);
                }}
                onPointerDown={(event) => {
                  if (reordering.disabled || event.pointerType === "mouse" || !event.isPrimary) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  touchDrag.current = { id: folder.id, x: event.clientX, y: event.clientY, active: false, target: null };
                }}
                onPointerMove={(event) => {
                  const drag = touchDrag.current;
                  if (!drag || reordering.disabled) return;
                  if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
                  drag.active = true;
                  setDraggedId(drag.id);
                  const card = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-card-id]");
                  const targetId = card?.dataset.cardId;
                  const rect = card?.getBoundingClientRect();
                  drag.target = targetId && targetId !== drag.id && rect
                    ? { id: targetId, after: event.clientY > rect.top + rect.height / 2 }
                    : null;
                  setDropTarget(drag.target);
                }}
                onPointerUp={(event) => {
                  const drag = touchDrag.current;
                  if (!drag) return;
                  if (!reordering.disabled && drag.active && drag.target) {
                    reordering.drop(drag.id, drag.target.id, drag.target.after);
                  }
                  endDrag();
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => { if (touchDrag.current) endDrag(); }}
                onLostPointerCapture={() => { if (touchDrag.current) endDrag(); }}
                onContextMenu={(event) => {
                  if (touchDrag.current) event.preventDefault();
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                </svg>
              </button>
            }
          />
        </div>
      ))}
    </div>
  );
}

export default function LinksPage() {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ attempt: number; order?: string[]; error?: string } | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/links/layout", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your card order. Please try again.");
        const data = await response.json();
        if (!isValidLinkCardOrder(data.order)) throw new Error("Could not load your card order. Please try again.");
        if (!controller.signal.aborted) setResult({ attempt: retry, order: normalizeLinkCardOrder(data.order) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ attempt: retry, error: "Could not load your card order. Please try again." });
      });
    return () => controller.abort();
  }, [retry]);

  const loading = result?.attempt !== retry;
  const loadError = loading ? undefined : result?.error;
  const savedOrder = result?.order;
  const order = normalizeLinkCardOrder(pendingOrder ?? savedOrder);
  const folders = order.map((id) => LINK_FOLDERS.find((folder) => folder.id === id)!);
  const reorderingDisabled = loading || !!loadError || !savedOrder || saving;

  const saveOrder = async (nextOrder: string[]) => {
    if (saveInFlight.current || loading || loadError || !savedOrder) return;
    saveInFlight.current = true;
    setPendingOrder(nextOrder);
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/links/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: nextOrder }),
      });
      if (!response.ok) throw new Error("Save failed");
      const data = await response.json();
      if (!isValidLinkCardOrder(data.order)) throw new Error("Invalid saved order");
      setResult({ attempt: retry, order: normalizeLinkCardOrder(data.order) });
      setPendingOrder(null);
      setAnnouncement("Card order saved.");
    } catch {
      setSaveError("Could not save your card order. Your changes are still here; please try again.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };
  const reorderCard = (id: string, nextOrder: string[]) => {
    if (reorderingDisabled || saveInFlight.current || nextOrder.every((cardId, index) => cardId === order[index])) return;
    const title = LINK_FOLDERS.find((folder) => folder.id === id)?.title;
    setAnnouncement(`${title} moved to position ${nextOrder.indexOf(id) + 1} of ${nextOrder.length}.`);
    void saveOrder(nextOrder);
  };
  const moveCard = (id: string, direction: -1 | 1) => {
    const from = order.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    const nextOrder = [...order];
    nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, id);
    reorderCard(id, nextOrder);
  };
  const dropCard = (id: string, targetId: string, after: boolean) => {
    if (id === targetId || !order.includes(id) || !order.includes(targetId)) return;
    const nextOrder = order.filter((cardId) => cardId !== id);
    nextOrder.splice(nextOrder.indexOf(targetId) + (after ? 1 : 0), 0, id);
    reorderCard(id, nextOrder);
  };

  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="links" />
      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <div className="border-b border-nb-ink/10 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Links</h2>
            {saving && <span className="text-xs text-nb-ink/60">Saving…</span>}
          </div>
          {saveError && (
            <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-700">
              {saveError}
              <button type="button" className="nb-btn px-3 py-1.5 text-xs" onClick={() => { if (pendingOrder) void saveOrder(pendingOrder); }}>Retry</button>
            </div>
          )}
          <p role="status" className="sr-only">{announcement}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <p role="status" className="text-sm text-nb-ink/60">Loading your card order…</p> : (
            <>
              {loadError && (
                <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 text-sm text-red-700">
                  {loadError}
                  <button type="button" className="nb-btn px-3 py-1.5 text-xs" onClick={() => setRetry((value) => value + 1)}>Retry</button>
                </div>
              )}
              {folders.length === 0 && <p className="text-sm font-medium text-nb-ink/50">No links configured.</p>}
              {folders.length > 0 && <ServiceMasonry folders={folders} reordering={{ disabled: reorderingDisabled, move: moveCard, drop: dropCard }} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
