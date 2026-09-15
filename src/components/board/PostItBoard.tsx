"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  JIRA_TICKET_KEY_REGEX,
  POSTIT_COLORS,
  POSTITS_CHANGED_EVENT,
  type PostItColor,
} from "@/lib/postits";
import { useIsMobile } from "@/lib/useIsMobile";

interface PostIt {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  deletedAt?: string | null;
}

const NOTE_SIZE = 200;
// Debounce for text/position PATCH requests so we don't spam the API while
// the user is typing or mid-drag.
const SAVE_DEBOUNCE_MS = 500;
// Trashed notes older than this are eligible for the bulk "delete all older
// than a week" purge action, mirrored server-side in the trash DELETE route.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function PostItBoard() {
  const [postIts, setPostIts] = useState<PostIt[] | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/postits")
      .then((res) => res.json())
      .then((data: { postIts: PostIt[] }) => {
        if (!cancelled) setPostIts(data.postIts ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleSave = useCallback((id: string, patch: Partial<PostIt>) => {
    const timers = saveTimers.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        fetch(`/api/postits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).catch(() => {});
      }, SAVE_DEBOUNCE_MS)
    );
  }, []);

  const updateNote = useCallback(
    (id: string, patch: Partial<PostIt>, opts?: { saveNow?: boolean }) => {
      setPostIts((prev) => prev?.map((n) => (n.id === id ? { ...n, ...patch } : n)) ?? prev);
      if (opts?.saveNow) {
        const timers = saveTimers.current;
        const existing = timers.get(id);
        if (existing) {
          clearTimeout(existing);
          timers.delete(id);
        }
        fetch(`/api/postits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).catch(() => {});
      } else {
        scheduleSave(id, patch);
      }
    },
    [scheduleSave]
  );

  const bringToFront = useCallback((id: string) => {
    setPostIts((prev) => {
      if (!prev) return prev;
      const maxZ = Math.max(0, ...prev.map((n) => n.zIndex));
      return prev.map((n) => (n.id === id ? { ...n, zIndex: maxZ + 1 } : n));
    });
    fetch(`/api/postits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bringToFront: true }),
    }).catch(() => {});
  }, []);

  const boardRef = useRef<HTMLDivElement>(null);

  const addNote = useCallback(async (pos?: { x: number; y: number }) => {
    const board = boardRef.current;
    // The canvas now always matches its visible container exactly (no
    // scrolling), so a brand-new note's random starting spot just needs to
    // stay within the container's current on-screen size.
    const maxX = board ? Math.max(0, board.clientWidth - NOTE_SIZE) : 60;
    const maxY = board ? Math.max(0, board.clientHeight - NOTE_SIZE) : 60;
    const x = pos ? pos.x : Math.min(maxX, 60 + Math.random() * 80);
    const y = pos ? pos.y : Math.min(maxY, 60 + Math.random() * 80);
    const color = POSTIT_COLORS[Math.floor(Math.random() * POSTIT_COLORS.length)];
    const res = await fetch("/api/postits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, color }),
    });
    const data = (await res.json()) as { postIt: PostIt };
    setPostIts((prev) => [...(prev ?? []), data.postIt]);
    window.dispatchEvent(new Event(POSTITS_CHANGED_EVENT));
  }, []);

  // Ids currently mid "flying into the bin" animation on the board itself
  // — separate from the trash panel's own removingIds (added earlier),
  // since this happens right when a *content-bearing* note is deleted from
  // the board (i.e. soft-deleted into the trash), not when it's later
  // permanently purged from the trash panel.
  const [removingBoardIds, setRemovingBoardIds] = useState<Set<string>>(new Set());
  // Per-note pixel offset (measured from the note to the real 🗑️ Trash
  // button at the moment delete is clicked) so the fly-out animation heads
  // toward wherever the button actually is on screen, instead of a fixed
  // guessed direction.
  const [removingOffsets, setRemovingOffsets] = useState<Map<string, { dx: number; dy: number }>>(
    new Map()
  );
  const BOARD_REMOVE_ANIM_MS = 320;
  const trashButtonRef = useRef<HTMLButtonElement>(null);

  const deleteNote = useCallback(
    (id: string, offset?: { dx: number; dy: number }) => {
      const note = postIts?.find((n) => n.id === id);
      // Blank notes are hard-deleted outright (never actually "put in the
      // bin" — see the DELETE route), so they're removed instantly with no
      // animation; only notes with real content that are eligible for the
      // trash get the fly-into-the-bin effect below.
      const eligibleForBin = !!note && note.text.trim() !== "";
      // Dispatch only once the DELETE has actually landed server-side —
      // firing it immediately raced the header's count refetch against
      // this request, so the badge could still read the pre-delete count.
      fetch(`/api/postits/${id}`, { method: "DELETE" })
        .catch(() => {})
        .finally(() => window.dispatchEvent(new Event(POSTITS_CHANGED_EVENT)));
      if (!eligibleForBin) {
        setPostIts((prev) => prev?.filter((n) => n.id !== id) ?? prev);
        return;
      }
      if (offset) {
        setRemovingOffsets((prev) => new Map(prev).set(id, offset));
      }
      setRemovingBoardIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setPostIts((prev) => prev?.filter((n) => n.id !== id) ?? prev);
        setRemovingBoardIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setRemovingOffsets((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }, BOARD_REMOVE_ANIM_MS);
    },
    [postIts]
  );

  // Trash: notes deleted while they still had actual (non-whitespace)
  // content are soft-deleted server-side (see the DELETE route) rather
  // than removed outright, so they can be recovered here. Fetched lazily,
  // only when the trash panel is opened.
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<PostIt[] | null>(null);

  const openTrash = useCallback(() => {
    setTrashOpen(true);
    setTrash(null);
    fetch("/api/postits/trash")
      .then((res) => res.json())
      .then((data: { postIts: PostIt[] }) => setTrash(data.postIts ?? []))
      .catch(() => setTrash([]));
  }, []);

  const restoreNote = useCallback((id: string) => {
    setTrash((prev) => prev?.filter((n) => n.id !== id) ?? prev);
    fetch(`/api/postits/${id}/restore`, { method: "POST" })
      .then((res) => res.json())
      .then((data: { postIt: PostIt }) => {
        setPostIts((prev) => [...(prev ?? []), data.postIt]);
        window.dispatchEvent(new Event(POSTITS_CHANGED_EVENT));
      })
      .catch(() => {});
  }, []);

  // Ids currently mid-removal-animation in the trash panel (either a single
  // "Delete forever" click or part of a bulk purge) — kept separate from
  // `trash` itself so the note can visually shrink/fade out before it's
  // actually removed from the list a moment later.
  const [removingTrashIds, setRemovingTrashIds] = useState<Set<string>>(new Set());
  const TRASH_REMOVE_ANIM_MS = 280;

  const permanentlyDeleteNote = useCallback((id: string) => {
    fetch(`/api/postits/${id}`, { method: "DELETE" }).catch(() => {});
    setRemovingTrashIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setTrash((prev) => prev?.filter((n) => n.id !== id) ?? prev);
      setRemovingTrashIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, TRASH_REMOVE_ANIM_MS);
  }, []);

  const purgeOldTrash = useCallback(() => {
    const cutoff = Date.now() - WEEK_MS;
    fetch("/api/postits/trash", { method: "DELETE" }).catch(() => {});
    const idsToRemove = (trash ?? [])
      .filter((n) => n.deletedAt && new Date(n.deletedAt).getTime() < cutoff)
      .map((n) => n.id);
    if (!idsToRemove.length) return;
    setRemovingTrashIds((current) => {
      const next = new Set(current);
      idsToRemove.forEach((id) => next.add(id));
      return next;
    });
    setTimeout(() => {
      setTrash((cur) => cur?.filter((n) => !idsToRemove.includes(n.id)) ?? cur);
      setRemovingTrashIds((current) => {
        const next = new Set(current);
        idsToRemove.forEach((id) => next.delete(id));
        return next;
      });
    }, TRASH_REMOVE_ANIM_MS);
  }, [trash]);

  // On mobile there's no room for a freely-draggable canvas, so notes are
  // rendered as a simple, non-draggable, scrollable list instead. Desktop
  // keeps the existing drag-anywhere canvas untouched.
  const isMobile = useIsMobile();

  // Keeps every note fully contained within the canvas's current on-screen
  // size — whenever the board container is resized (e.g. the browser
  // window is narrowed), any note that would now stick out past the right
  // or bottom edge is pulled back in. Runs on the desktop canvas layout
  // only; the mobile list layout doesn't use x/y positioning at all.
  useEffect(() => {
    if (isMobile) return;
    const board = boardRef.current;
    if (!board) return;

    const clampNotes = (width: number, height: number) => {
      const maxX = Math.max(0, width - NOTE_SIZE);
      const maxY = Math.max(0, height - NOTE_SIZE);
      setPostIts((prev) => {
        if (!prev) return prev;
        let changed = false;
        const next = prev.map((n) => {
          const x = Math.min(n.x, maxX);
          const y = Math.min(n.y, maxY);
          if (x === n.x && y === n.y) return n;
          changed = true;
          scheduleSave(n.id, { x, y });
          return { ...n, x, y };
        });
        return changed ? next : prev;
      });
    };

    // Clamp once immediately (covers notes saved from a wider window
    // before this page load) and again on every subsequent resize.
    clampNotes(board.clientWidth, board.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      clampNotes(width, height);
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, [isMobile, scheduleSave]);

  // There's no toolbar/button anymore — double-clicking or double-tapping
  // empty board space (i.e. not on top of an existing note) creates a new
  // note there. Requiring a double-click (rather than single) avoids
  // accidentally creating notes while just clicking around the board, and
  // mirrors the double-click-to-edit gesture used on notes themselves.
  // A `.postit-note` ancestor check lets clicks on a note's own controls
  // (color dots, delete, textarea, ...) pass through untouched.
  const handleBoardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".postit-note")) return;
    const board = boardRef.current;
    if (!board) {
      addNote();
      return;
    }
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left - NOTE_SIZE / 2;
    const y = e.clientY - rect.top - 20;
    addNote({
      x: Math.max(0, Math.min(x, Math.max(0, board.clientWidth - NOTE_SIZE))),
      y: Math.max(0, Math.min(y, Math.max(0, board.clientHeight - NOTE_SIZE))),
    });
  };

  const handleListDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".postit-note")) return;
    addNote();
  };

  return (
    <div className="relative flex h-full flex-col">
      {isMobile ? (
        <div
          onDoubleClick={handleListDoubleClick}
          className="flex-1 space-y-3 overflow-y-auto p-3"
        >
          {postIts?.length === 0 && (
            <p className="p-8 text-sm font-medium text-nb-ink/40">
              No notes yet — double-tap anywhere to add one.
            </p>
          )}
          {postIts?.map((note) => (
            <PostItNote
              key={note.id}
              note={note}
              layout="list"
              removing={removingBoardIds.has(note.id)}
              removeOffset={removingOffsets.get(note.id)}
              trashButtonRef={trashButtonRef}
              onChange={(patch, opts) => updateNote(note.id, patch, opts)}
              onDelete={(offset) => deleteNote(note.id, offset)}
            />
          ))}
        </div>
      ) : (
        <div
          ref={boardRef}
          onDoubleClick={handleBoardDoubleClick}
          className="postit-board-canvas relative z-0 flex-1 overflow-auto"
        >
          {postIts?.length === 0 && (
            <p className="p-8 text-sm font-medium text-nb-ink/40">
              No notes yet — double-click anywhere to add one.
            </p>
          )}
          {postIts?.map((note) => (
            <PostItNote
              key={note.id}
              note={note}
              layout="canvas"
              removing={removingBoardIds.has(note.id)}
              removeOffset={removingOffsets.get(note.id)}
              trashButtonRef={trashButtonRef}
              onChange={(patch, opts) => updateNote(note.id, patch, opts)}
              onDragStart={() => bringToFront(note.id)}
              onDelete={(offset) => deleteNote(note.id, offset)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        ref={trashButtonRef}
        onClick={openTrash}
        aria-label="Open trash"
        title="Trash"
        className="nb-btn absolute bottom-4 left-4 z-30 flex items-center gap-1.5 px-4 py-2 text-sm shadow-lg"
      >
        <TrashIcon className="h-4 w-4" />
        Trash
      </button>
      <button
        type="button"
        onClick={() => addNote()}
        className="nb-btn nb-btn-orange absolute bottom-4 right-4 z-30 px-4 py-2 text-sm shadow-lg"
      >
        + Add note
      </button>
      {trashOpen && (
        <TrashPanel
          notes={trash}
          removingIds={removingTrashIds}
          onRestore={restoreNote}
          onDeleteForever={permanentlyDeleteNote}
          onPurgeOld={purgeOldTrash}
          onClose={() => setTrashOpen(false)}
        />
      )}
    </div>
  );
}

function TrashPanel({
  notes,
  removingIds,
  onRestore,
  onDeleteForever,
  onPurgeOld,
  onClose,
}: {
  notes: PostIt[] | null;
  removingIds: Set<string>;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onPurgeOld: () => void;
  onClose: () => void;
}) {
  // Captured once (lazy useState initializer, not a render-time call) so
  // the "older than a week" cutoff used below is a pure, stable value for
  // as long as the panel stays open, instead of calling Date.now() from
  // the render body directly.
  const [openedAt] = useState(() => Date.now());
  const oldCount =
    notes?.filter((n) => n.deletedAt && openedAt - new Date(n.deletedAt).getTime() >= WEEK_MS)
      .length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="nb-panel flex max-h-[80vh] w-full max-w-md flex-col bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-nb-ink">
            <TrashIcon className="h-5 w-5" />
            Trash
          </h2>
          <div className="flex items-center gap-3">
            {oldCount > 0 && (
              <button
                type="button"
                onClick={onPurgeOld}
                className="nb-btn px-2 py-1 text-xs font-semibold text-nb-pink"
                title="Permanently delete every note trashed more than a week ago"
              >
                Delete all older than a week ({oldCount})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-lg font-bold leading-none text-nb-ink/50 hover:text-nb-ink"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden">
          {notes === null && (
            <p className="text-sm font-medium text-nb-ink/50">Loading…</p>
          )}
          {notes?.length === 0 && (
            <p className="text-sm font-medium text-nb-ink/40">
              Trash is empty — deleted notes with content show up here.
            </p>
          )}
          {notes?.map((note) => (
            <div
              key={note.id}
              className={`postit-note flex items-start gap-3 p-3 transition-all duration-300 ease-in ${
                removingIds.has(note.id)
                  ? "pointer-events-none -translate-x-2 scale-90 opacity-0"
                  : "translate-x-0 scale-100 opacity-100"
              }`}
              style={{ background: `var(--postit-${note.color})` }}
            >
              <div className="min-w-0 flex-1">
                <p className="overflow-hidden whitespace-pre-wrap break-words text-sm font-medium text-nb-ink">
                  {note.text}
                </p>
                {note.deletedAt && (
                  <p className="mt-1 text-xs font-medium text-nb-ink/50">
                    Deleted {formatDeletedAt(note.deletedAt)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onRestore(note.id)}
                  className="nb-btn nb-btn-green px-2 py-1 text-xs font-semibold"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteForever(note.id)}
                  className="nb-btn px-2 py-1 text-xs font-semibold text-nb-pink"
                >
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Renders a short relative time (e.g. "5m ago", "3d ago") for recent
// deletions, falling back to an absolute date once it's more than a week
// old — mirrors the cutoff used by the bulk purge action.
function formatDeletedAt(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// A plain black outline trash-bin icon (replaces the 🗑️ emoji, which
// renders inconsistently — full color, tiny, or as a fallback glyph —
// depending on the platform/font).
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="black"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function PostItNote({
  note,
  layout,
  removing,
  removeOffset,
  trashButtonRef,
  onChange,
  onDragStart,
  onDelete,
}: {
  note: PostIt;
  layout: "canvas" | "list";
  removing?: boolean;
  removeOffset?: { dx: number; dy: number };
  trashButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onChange: (patch: Partial<PostIt>, opts?: { saveNow?: boolean }) => void;
  onDragStart?: () => void;
  onDelete: (offset?: { dx: number; dy: number }) => void;
}) {
  const dragState = useRef<{ startX: number; startY: number; noteX: number; noteY: number } | null>(
    null
  );
  const noteRef = useRef<HTMLDivElement>(null);

  // Measures the note's and the trash button's current screen positions so
  // the fly-out animation heads toward wherever the 🗑️ button actually is,
  // rather than a fixed guessed direction.
  const handleDeleteClick = () => {
    const noteEl = noteRef.current;
    const trashEl = trashButtonRef?.current;
    if (noteEl && trashEl) {
      const noteRect = noteEl.getBoundingClientRect();
      const trashRect = trashEl.getBoundingClientRect();
      const dx = trashRect.left + trashRect.width / 2 - (noteRect.left + noteRect.width / 2);
      const dy = trashRect.top + trashRect.height / 2 - (noteRect.top + noteRect.height / 2);
      onDelete({ dx, dy });
    } else {
      onDelete();
    }
  };
  // Whether the pointer has moved past DRAG_THRESHOLD_PX since pointerdown —
  // used to tell an actual drag apart from a tap/click so that dragging
  // works reliably from anywhere on the note (including over the note's
  // text, which also has a click-to-edit handler) without every drag also
  // flipping the note into edit mode the instant it's released.
  const dragMoved = useRef(false);
  // Small dead zone (in px) before a pointer-down-then-move counts as a
  // drag rather than a click — keeps single taps/clicks (color dots aside,
  // which are excluded below) working normally.
  const DRAG_THRESHOLD_PX = 4;
  // Manual double-click/double-tap tracking for entering edit mode (see
  // handleViewPointerUp below) — done by hand, keyed off our own pointer
  // lifecycle, rather than relying on the browser's native dblclick event.
  // The native event can misfire right after a drag: per spec, pointer
  // capture (used below to make dragging work) only redirects *pointer*
  // events, not the legacy mousedown/mouseup/click events the browser
  // derives dblclick from, so a drag-then-release could still register as
  // part of a click pair on whatever element the cursor happened to end up
  // over — flipping the note into edit mode right as a drag finished.
  const lastClickAt = useRef(0);
  const DOUBLE_CLICK_MS = 350;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (layout === "list" || e.button !== 0) return;
    // Let clicks on buttons (color dots, delete, ticket-key refs) and text
    // editing (the textarea) through untouched — everything else on the
    // note, including its edges/background and its non-editing text view,
    // picks it up for dragging.
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    onDragStart?.();
    dragMoved.current = false;
    dragState.current = { startX: e.clientX, startY: e.clientY, noteX: note.x, noteY: note.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (layout === "list" || !dragState.current) return;
    const { startX, startY, noteX, noteY } = dragState.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragMoved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragMoved.current = true;
    onChange({ x: noteX + dx, y: noteY + dy });
  };

  const handlePointerUp = () => {
    if (layout === "list" || !dragState.current) return;
    dragState.current = null;
    if (dragMoved.current) onChange({ x: note.x, y: note.y }, { saveNow: true });
  };

  // Notes start in edit mode when empty (a brand-new note) so the user can
  // type right away; otherwise they start in "view" mode so any Jira ticket
  // reference in the text is immediately clickable.
  const [isEditing, setIsEditing] = useState(() => note.text.trim() === "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [popover, setPopover] = useState<{ key: string; left: number; top: number } | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // Place the cursor at the end of the existing text rather than
    // leaving it wherever focus() defaults to (typically the start).
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [isEditing]);

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onChange({ text: e.target.value }, { saveNow: true });
    // Clicking/tapping elsewhere always exits typing mode now, even for a
    // still-blank note — it simply shows as an empty note in view mode
    // rather than being stuck in the textarea until real text is entered.
    setIsEditing(false);
  };

  const openTicketPopover = (key: string, rect: DOMRect) => {
    setPopover({ key, left: rect.left, top: rect.bottom + 6 });
  };

  // Attached to the (non-editing) text view only — flips into edit mode on
  // a genuine double-click/double-tap there, ignoring the release that
  // ends a drag (dragMoved) so dragging never accidentally opens editing.
  const handleViewPointerUp = () => {
    if (dragMoved.current) return;
    const now = Date.now();
    if (now - lastClickAt.current < DOUBLE_CLICK_MS) {
      lastClickAt.current = 0;
      setIsEditing(true);
    } else {
      lastClickAt.current = now;
    }
  };

  return (
    <div
      ref={noteRef}
      className={
        layout === "list"
          ? `postit-note w-full select-none ${removing ? "pointer-events-none opacity-0" : "opacity-100"}`
          : `postit-note postit-draggable absolute cursor-move select-none ${
              removing ? "pointer-events-none opacity-0" : "opacity-100"
            }`
      }
      style={
        layout === "list"
          ? {
              background: `var(--postit-${note.color})`,
              // Flies toward wherever the 🗑️ Trash button actually is
              // (measured on click, see handleDeleteClick) rather than a
              // fixed guessed direction; falls back to a small generic
              // shrink if that measurement wasn't available.
              transform: removing
                ? `translate(${removeOffset?.dx ?? 0}px, ${removeOffset?.dy ?? 40}px) scale(0.15)`
                : "translate(0, 0) scale(1)",
            }
          : {
              left: note.x,
              top: note.y,
              width: NOTE_SIZE,
              zIndex: note.zIndex,
              transform: removing
                ? `rotate(${note.rotation}deg) translate(${removeOffset?.dx ?? -40}px, ${
                    removeOffset?.dy ?? 40
                  }px) scale(0.15)`
                : `rotate(${note.rotation}deg)`,
              background: `var(--postit-${note.color})`,
            }
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex gap-1">
          {POSTIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Set color ${c}`}
              onClick={() => onChange({ color: c }, { saveNow: true })}
              className="h-3.5 w-3.5 rounded-full border border-nb-ink/30"
              style={{ background: `var(--postit-${c})`, outline: c === note.color ? "2px solid var(--nb-ink)" : undefined }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label={note.text.trim() === "" ? "Delete note" : "Move note to trash"}
          onClick={handleDeleteClick}
          className="-m-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm font-bold leading-none text-nb-ink/60 hover:text-nb-ink"
        >
          {note.text.trim() === "" ? "✕" : <TrashIcon className="h-5 w-5" />}
        </button>
      </div>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={note.text}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={handleBlur}
          placeholder="Type a note…"
          className="postit-textarea h-32 w-full resize-none bg-transparent px-3 py-2 text-sm font-medium text-nb-ink outline-none placeholder:text-nb-ink/30"
        />
      ) : (
        <div
          onPointerUp={handleViewPointerUp}
          className="postit-textarea h-32 w-full cursor-move overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-sm font-medium text-nb-ink"
        >
          {note.text.trim() === "" ? (
            <span className="text-nb-ink/30">Type a note…</span>
          ) : (
            renderNoteText(note.text, openTicketPopover)
          )}
        </div>
      )}
      {popover && (
        <TicketRefPopover
          ticketKey={popover.key}
          left={popover.left}
          top={popover.top}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

/**
 * Splits a note's text on Jira ticket key matches (e.g. "PROJ-123") and
 * renders each match as a clickable button that opens the ticket popover,
 * leaving the rest of the text as plain text.
 */
function renderNoteText(
  text: string,
  onOpen: (key: string, rect: DOMRect) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(JIRA_TICKET_KEY_REGEX);
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const key = match[0];
    nodes.push(
      <button
        key={`${key}-${match.index}`}
        type="button"
        className="cursor-pointer font-bold text-nb-ink underline decoration-2 underline-offset-2 hover:text-nb-orange"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(key, (e.target as HTMLElement).getBoundingClientRect());
        }}
      >
        {key}
      </button>
    );
    lastIndex = match.index + key.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

interface TicketPopoverState {
  status: "loading" | "error" | "ok";
  message?: string;
  summary?: string;
  ticketStatus?: string;
  browseUrl?: string;
}

function TicketRefPopover({
  ticketKey,
  left,
  top,
  onClose,
}: {
  ticketKey: string;
  left: number;
  top: number;
  onClose: () => void;
}) {
  const [state, setState] = useState<TicketPopoverState>({ status: "loading" });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jira/tickets/${encodeURIComponent(ticketKey)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", message: data.error ?? "Failed to load ticket" });
          return;
        }
        setState({
          status: "ok",
          summary: data.ticket.summary,
          ticketStatus: data.ticket.status,
          browseUrl: data.browseUrl,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Failed to load ticket" });
      });
    return () => {
      cancelled = true;
    };
  }, [ticketKey]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
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

  return createPortal(
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="nb-panel-sm fixed z-50 w-64 bg-white p-3 text-left text-sm normal-case"
      style={{ left, top }}
    >
      <p className="mb-1 font-bold text-nb-ink">{ticketKey}</p>
      {state.status === "loading" && <p className="text-nb-ink/50">Loading…</p>}
      {state.status === "error" && <p className="text-nb-pink">{state.message}</p>}
      {state.status === "ok" && (
        <>
          <span className="nb-badge mb-2 inline-block px-2 py-0.5 text-xs font-semibold">
            {state.ticketStatus}
          </span>
          <p className="mb-3 font-medium text-nb-ink/80">{state.summary}</p>
          <a
            href={state.browseUrl}
            target="_blank"
            rel="noreferrer"
            className="nb-btn nb-btn-orange w-full justify-center px-3 py-1.5 text-xs"
          >
            Open in Jira ↗
          </a>
        </>
      )}
    </div>,
    document.body
  );
}

// Re-export for type consumers.
export type { PostItColor };
