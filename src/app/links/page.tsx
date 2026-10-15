"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { AppHeader } from "@/components/AppHeader";
import { LINK_FOLDERS, type BookmarkFolder, type BookmarkLink } from "@/lib/linksData";
import { buildServiceGrid, type GridCell } from "@/lib/bookmarkGrid";

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
    // Resizing repacks the cards, so dismiss any menu attached to their old position.
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
          className="nb-panel-sm fixed z-50 max-h-[calc(100dvh-1rem)] w-44 -translate-x-1/2 overflow-y-auto bg-white p-1.5 text-left"
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

function ServiceCard({ folder }: { folder: BookmarkFolder }) {
  const grid = buildServiceGrid(folder);
  const hasGrid = folder.layout !== "list" && grid.environments.length > 0 && grid.tenants.length > 0;
  const links = folder.layout === "list"
    ? folder.children.filter((node): node is BookmarkLink => node.type === "link")
    : grid.other;

  return (
    <div className="nb-panel-sm w-max max-w-full bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-nb-ink">{grid.title}</h3>

      {hasGrid && (
        <div className="max-w-full overflow-x-auto">
          <table className="w-max border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-0" />
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
          className={hasGrid ? "mt-3 border-t border-nb-ink/10 pt-3" : "max-w-sm"}
        />
      )}
    </div>
  );
}

interface CardPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

function ServiceMosaic({ folders }: { folders: BookmarkFolder[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ cards: CardPlacement[]; height: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const gap = 16;
    const observer = new ResizeObserver(() => {
      const availableWidth = container.getBoundingClientRect().width;
      const cards: CardPlacement[] = [];

      for (const element of Array.from(container.children)) {
        const { width, height } = element.getBoundingClientRect();
        const leftEdges = [0, ...cards.map((card) => card.left + card.width + gap)].sort((a, b) => a - b);
        const topEdges = [0, ...cards.map((card) => card.top + card.height + gap)].sort((a, b) => a - b);

        // Try the highest available space first, then the leftmost. Candidate
        // edges let smaller cards fill gaps beside and beneath larger ones.
        for (const top of topEdges) {
          const left = leftEdges.find((candidate) =>
            candidate + width <= availableWidth + 0.01 &&
            !cards.some((card) =>
              candidate < card.left + card.width + gap - 0.01 &&
              candidate + width + gap > card.left + 0.01 &&
              top < card.top + card.height + gap - 0.01 &&
              top + height + gap > card.top + 0.01
            )
          );
          if (left !== undefined) {
            cards.push({ left, top, width, height });
            break;
          }
        }
      }

      const height = Math.max(0, ...cards.map((card) => card.top + card.height));
      setLayout((previous) => {
        if (previous?.height === height && previous.cards.length === cards.length && cards.every((card, index) => {
          const before = previous.cards[index];
          return card.left === before.left && card.top === before.top && card.width === before.width && card.height === before.height;
        })) return previous;
        return { cards, height };
      });
    });

    observer.observe(container);
    for (const card of Array.from(container.children)) observer.observe(card);
    return () => observer.disconnect();
  }, [folders]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-start gap-4"
      style={layout ? { height: layout.height } : undefined}
    >
      {folders.map((folder, index) => {
        const placement = layout?.cards[index];
        return (
          <div
            key={folder.title}
            className="w-max max-w-full"
            // Top/left preserve the viewport positioning of backend popovers;
            // a transform would make each card their containing block.
            style={placement ? { position: "absolute", left: placement.left, top: placement.top } : undefined}
          >
            <ServiceCard folder={folder} />
          </div>
        );
      })}
    </div>
  );
}

export default function LinksPage() {
  const folders = LINK_FOLDERS;

  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="links" />
      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <div className="border-b border-nb-ink/10 bg-white px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Links</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {folders.length === 0 && (
            <p className="text-sm font-medium text-nb-ink/50">No links configured.</p>
          )}
          {folders.length > 0 && (
            <ServiceMosaic folders={folders} />
          )}
        </div>
      </div>
    </div>
  );
}
