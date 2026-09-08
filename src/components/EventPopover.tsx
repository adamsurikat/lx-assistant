"use client";

import { useEffect, useRef } from "react";

export interface EventPopoverData {
  title: string;
  start?: Date;
  end?: Date;
  readOnly: boolean;
  ticketKey?: string;
  ticketStatus?: string;
  unassigned?: boolean;
  synced?: boolean;
  syncError?: string | null;
  jiraUrl?: string;
  googleLink?: string;
}

interface EventPopoverProps {
  data: EventPopoverData;
  anchor: { x: number; y: number };
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function formatRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Small floating card anchored near the clicked event, showing a quick
 * summary plus a link out to the source (Jira ticket / Google Calendar
 * event) and, for editable time entries, a button into the full editor.
 */
export function EventPopover({ data, anchor, onClose, onEdit, onDelete }: EventPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Keep the popover roughly on-screen — clamp so it doesn't render past
  // the right/bottom edge of the viewport.
  const width = 288;
  const left = Math.min(anchor.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 16);
  const top = Math.min(anchor.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 220);

  return (
    <div
      ref={ref}
      className="nb-panel-sm fixed z-50 w-72 bg-white p-4"
      style={{ left: Math.max(left, 8), top: Math.max(top, 8) }}
    >
      <p className="pr-4 text-sm font-bold text-nb-ink">{data.title}</p>
      {data.start && data.end && (
        <p className="mt-1 text-xs font-medium text-nb-ink/60">
          {formatRange(data.start, data.end)}
        </p>
      )}

      {data.ticketStatus && (
        <span className="mt-2 nb-badge">
          {data.ticketStatus}
        </span>
      )}

      {!data.readOnly && (
        <p className="mt-2 text-xs font-semibold">
          {data.unassigned ? (
            <span className="text-nb-ink/50">No ticket assigned</span>
          ) : data.syncError ? (
            <span className="text-nb-pink">Sync error: {data.syncError}</span>
          ) : data.synced ? (
            <span className="text-nb-green">✓ Synced to Jira</span>
          ) : (
            <span className="text-nb-ink/50">Not yet synced</span>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {data.jiraUrl && (
          <a
            href={data.jiraUrl}
            target="_blank"
            rel="noreferrer"
            className="nb-btn nb-btn-orange px-3 py-1.5 text-xs font-semibold"
          >
            Open in Jira ↗
          </a>
        )}
        {data.googleLink && (
          <a
            href={data.googleLink}
            target="_blank"
            rel="noreferrer"
            className="nb-btn nb-btn-green px-3 py-1.5 text-xs font-semibold"
          >
            Open in Google Calendar ↗
          </a>
        )}
        {!data.readOnly && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="nb-btn px-3 py-1.5 text-xs font-semibold"
          >
            Edit
          </button>
        )}
        {!data.readOnly && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="nb-btn px-3 py-1.5 text-xs font-semibold text-nb-pink"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
