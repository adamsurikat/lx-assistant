"use client";

import { useEffect, useState, useCallback, type SyntheticEvent } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TicketSidebar, type TicketSummary } from "@/components/TicketSidebar";
import { TimeCalendar, type CalendarEventItem } from "@/components/TimeCalendar";
import { EventEditorModal, type EditableEntry, formatDuration } from "@/components/EventEditorModal";
import { EventPopover, type EventPopoverData } from "@/components/EventPopover";
import { HoursSummaryModal, formatHours } from "@/components/HoursSummaryModal";
import { Toast } from "@/components/Toast";
import { useIsMobile } from "@/lib/useIsMobile";

interface TimeEntryDTO {
  id: string;
  start: string;
  end: string;
  title: string | null;
  comment: string | null;
  syncedToJira: boolean;
  lastSyncError: string | null;
  ticket: TicketSummary | null;
}

interface GoogleCalendarEventDTO {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift Sunday(0) back to previous Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

const MONTH_DAY_FORMAT: Intl.DateTimeFormatOptions = { month: "long", day: "2-digit" };
const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit" };

// Mirrors react-big-calendar's own work_week range label (e.g. "September 07
// – 11"), computed here directly since the toolbar is now rendered outside
// the Calendar component (see the header above TicketSidebar/TimeCalendar).
// Locale is pinned to "en-US" (rather than the runtime default) so the
// server-rendered HTML always matches the client, regardless of the
// browser's locale — otherwise this mismatches and triggers a hydration
// error (e.g. server renders "September 07", browser renders "07 September").
function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4); // Mon..Fri
  const start = weekStart.toLocaleDateString("en-US", MONTH_DAY_FORMAT);
  const end =
    weekStart.getMonth() === weekEnd.getMonth()
      ? weekEnd.toLocaleDateString("en-US", DAY_FORMAT)
      : weekEnd.toLocaleDateString("en-US", MONTH_DAY_FORMAT);
  return `${start} – ${end}`;
}

const DAY_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "2-digit",
};

// Mobile shows a single day rather than a week range — label it plainly
// (e.g. "Wednesday, September 09"). Locale pinned for the same
// server/client hydration reason as formatWeekLabel above.
function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", DAY_LABEL_FORMAT);
}

// ISO-8601 week number: weeks start on Monday, and week 1 is the week
// containing the year's first Thursday.
function getISOWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7; // Sunday(0) -> 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface HomeClientProps {
  // Fetched server-side (see app/page.tsx) so the ticket drawer/toggle
  // already reflects the DB's current count on first paint, instead of
  // showing "Tickets" and then jumping to "Tickets (9)" once the client's
  // own fetch resolves.
  initialTickets: TicketSummary[];
  userId: string | null;
}

export function HomeClient({ initialTickets, userId }: HomeClientProps) {
  const [tickets, setTickets] = useState<TicketSummary[]>(initialTickets);
  const [entries, setEntries] = useState<TimeEntryDTO[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEventDTO[]>([]);
  // We already have server-fetched tickets above, so there's nothing to
  // show a loading placeholder for on first paint.
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);
  const [jiraSiteUrl, setJiraSiteUrl] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [ticketJql, setTicketJql] = useState("");
  const [ticketDefaultJql, setTicketDefaultJql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dismissErrorToast = useCallback(() => setError(null), []);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [draftEntry, setDraftEntry] = useState<{
    start: Date;
    end: Date;
    ticketId?: string;
  } | null>(null);
  // Ids of time entries (or "__draft__" for a not-yet-created entry) whose
  // create/update request is currently in flight — the server awaits the
  // Jira worklog sync before responding, so this drives a spinner on the
  // affected calendar tile until Jira confirms the write.
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const markSyncing = (id: string, value: boolean) => {
    setSyncingIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const [popover, setPopover] = useState<{
    data: EventPopoverData;
    anchor: { x: number; y: number };
    entryId: string | null;
  } | null>(null);
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // On mobile the calendar only ever shows a single day (see TimeCalendar),
  // so Back/Next step by one day there instead of by a full week.
  const isMobile = useIsMobile();
  const navigationStepDays = isMobile ? 1 : 7;

  // Navigation for the toolbar rendered above the sidebar/calendar row
  // (previously RBC's own toolbar handled this internally).
  const handleToday = () => setCurrentDate(new Date());
  const handleBack = () =>
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - navigationStepDays);
      return d;
    });
  const handleNextWeek = () =>
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + navigationStepDays);
      return d;
    });

  const weekStart = startOfWeekMonday(currentDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 14); // load 2 weeks so week nav feels responsive

  // `silent` skips the loading-placeholder toggle — used when reloading
  // after a background Jira sync, so the already-rendered ticket list
  // (from the DB) doesn't flash to "Loading…" and back.
  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoadingTickets(true);
    const res = await fetch("/api/jira/tickets");
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets);
    }
    if (!silent) setLoadingTickets(false);
  }, []);

  const loadEntries = useCallback(async () => {
    const params = new URLSearchParams({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    });
    const res = await fetch(`/api/time-entries?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const loadJiraStatus = useCallback(async () => {
    const res = await fetch("/api/jira/token");
    if (res.ok) {
      const data = await res.json();
      setJiraConnected(Boolean(data.connected));
      setJiraSiteUrl(data.jiraSiteUrl ?? null);
    }
  }, []);

  const loadTicketJql = useCallback(async () => {
    const res = await fetch("/api/jira/jql");
    if (res.ok) {
      const data = await res.json();
      setTicketJql(data.jql);
      setTicketDefaultJql(data.defaultJql);
    }
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    const res = await fetch("/api/google-calendar/status");
    if (res.ok) {
      const data = await res.json();
      setGoogleConnected(Boolean(data.connected));
    } else {
      setGoogleConnected(false);
    }
  }, []);

  const loadGoogleEvents = useCallback(async () => {
    if (!googleConnected) return;
    const params = new URLSearchParams({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    });
    const res = await fetch(`/api/google-calendar/events?${params}`);
    if (res.ok) {
      const data = await res.json();
      setGoogleEvents(data.events ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, googleConnected]);

  // Refreshes the DB cache from the live Google Calendar API for the
  // visible window, then reloads from the (now-updated) cache — mirrors
  // handleSync's DB-first-then-background-refresh pattern for tickets.
  const syncGoogleEvents = useCallback(async () => {
    if (!googleConnected) return;
    const params = new URLSearchParams({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    });
    const res = await fetch(`/api/google-calendar/events?${params}`, { method: "POST" });
    if (res.ok) {
      await loadGoogleEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, googleConnected, loadGoogleEvents]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/jira/tickets", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to sync tickets from Jira.");
      } else {
        await loadTickets(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to sync tickets from Jira: ${err.message}`
          : "Failed to sync tickets from Jira."
      );
    } finally {
      setSyncing(false);
    }
  }, [loadTickets]);

  const handleSaveJql = useCallback(async (jql: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/jira/jql", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jql }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save Jira query.");
        return false;
      }
      const data = await res.json();
      setTicketJql(data.jql);
      setTicketDefaultJql(data.defaultJql);
      await handleSync();
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to save Jira query: ${err.message}`
          : "Failed to save Jira query."
      );
      return false;
    }
  }, [handleSync]);

  useEffect(() => {
    // Silent: we already have server-fetched tickets (see initialTickets
    // above), so this is just a background refresh, not the first load.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/navigate
    loadTickets(true);
    loadJiraStatus();
    loadTicketJql();
    loadGoogleStatus();
  }, [loadTickets, loadJiraStatus, loadTicketJql, loadGoogleStatus]);

  // Once we know Jira is actually connected, kick off a background sync so
  // the ticket drawer reflects the latest Jira state on every page load
  // (rather than only showing whatever was last cached locally).
  useEffect(() => {
    if (jiraConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount once Jira connection status is known
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when connection status changes, not on every handleSync identity change
  }, [jiraConnected]);

  useEffect(() => {
    // Re-fetch whenever the visible week range changes (e.g. Back/Next).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-navigate
    loadEntries();
    loadGoogleEvents();
  }, [loadEntries, loadGoogleEvents]);

  // Once we know Google Calendar is connected (or the visible week
  // changes), kick off a background sync so the cached events reflect the
  // latest Google state on every page load/navigation, same as tickets.
  useEffect(() => {
    if (googleConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/navigate once connection status is known
      syncGoogleEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when connection status or week changes, not on every syncGoogleEvents identity change
  }, [googleConnected, currentDate]);

  const handleDropTicket = (ticketId: string, start: Date, end: Date) => {
    // Open the editor instead of creating the entry immediately so a
    // Jira worklog comment is required, same as any other ticket entry.
    setError(null);
    setDraftEntry({ start, end, ticketId });
  };

  // Opens the editor with an uncommitted draft entry; nothing is written to
  // the DB until the user presses Save (see handleCreateEntry).
  const handleCreateBlankEvent = (start: Date, end: Date) => {
    setError(null);
    setDraftEntry({ start, end });
  };

  const handleCreateEntry = async (payload: {
    ticketId: string | null;
    title: string | null;
    comment: string | null;
  }) => {
    if (!draftEntry) return;
    setError(null);
    markSyncing("__draft__", true);
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: payload.ticketId ?? undefined,
        start: draftEntry.start.toISOString(),
        end: draftEntry.end.toISOString(),
        title: payload.title ?? "",
        comment: payload.comment ?? "",
      }),
    });
    markSyncing("__draft__", false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create time entry.");
      return;
    }
    await loadEntries();
    setDraftEntry(null);
  };

  const handleEventChange = async (id: string, start: Date, end: Date) => {
    setError(null);
    // Update local state immediately so the event stays at the dropped
    // position instead of snapping back to its old spot while the PATCH
    // request is in flight, then jumping to the new spot once it resolves.
    const previousEntries = entries;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, start: start.toISOString(), end: end.toISOString() }
          : entry
      )
    );
    markSyncing(id, true);
    const res = await fetch(`/api/time-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: start.toISOString(), end: end.toISOString() }),
    });
    markSyncing(id, false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update time entry.");
      setEntries(previousEntries);
      return;
    }
    await loadEntries();
  };

  const handleSaveEntry = async (
    entryId: string,
    payload: { ticketId: string | null; title: string | null; comment: string | null }
  ) => {
    setError(null);
    const body: { ticketId: string | null; title?: string; comment?: string } = {
      ticketId: payload.ticketId,
      title: payload.title ?? "",
    };
    body.comment = payload.comment ?? "";
    markSyncing(entryId, true);
    const res = await fetch(`/api/time-entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    markSyncing(entryId, false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save time entry.");
      return;
    }
    await loadEntries();
    setEditingEntryId(null);
  };

  // Looks up any Jira ticket by key (not just ones already synced/assigned)
  // for use in the event editor's ticket search box. Deliberately does NOT
  // add it to the sidebar's tracked ticket list — it's only attached to
  // whichever single time entry the user assigns it to.
  const handleLookupTicket = async (key: string): Promise<TicketSummary | null> => {
    const res = await fetch("/api/jira/tickets/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const ticket: TicketSummary = data.ticket;
    return ticket;
  };

  const handleDeleteEntry = async (entryId: string) => {
    const res = await fetch(`/api/time-entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      await loadEntries();
      setEditingEntryId(null);
    }
  };

  // Deletes the entry's existing Jira worklog (if any) and immediately
  // creates a fresh one, back to back — used for a clean "force resync"
  // instead of the usual incremental update.
  const handleResyncEntry = async (entryId: string) => {
    setError(null);
    markSyncing(entryId, true);
    const res = await fetch(`/api/time-entries/${entryId}/resync`, { method: "POST" });
    markSyncing(entryId, false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to resync time entry to Jira.");
    }
    await loadEntries();
  };

  const handleSelectEvent = (
    event: CalendarEventItem,
    domEvent: SyntheticEvent<HTMLElement>
  ) => {
    const mouseEvent = domEvent.nativeEvent as MouseEvent;
    const anchor = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    const data: EventPopoverData = {
      title: event.title,
      start: event.start,
      end: event.end,
      readOnly: Boolean(event.readOnly),
      ticketKey: event.ticketKey,
      ticketStatus: event.ticketStatus,
      unassigned: event.unassigned,
      synced: event.synced,
      syncError: event.syncError,
      jiraUrl:
        event.ticketKey && jiraSiteUrl
          ? `${jiraSiteUrl.replace(/\/$/, "")}/browse/${event.ticketKey}`
          : undefined,
      googleLink: event.googleLink,
    };
    setPopover({ data, anchor, entryId: event.readOnly ? null : event.id });
  };

  const handleSelectTicket = (ticket: TicketSummary, domEvent: SyntheticEvent<HTMLElement>) => {
    const mouseEvent = domEvent.nativeEvent as MouseEvent;
    const anchor = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    const data: EventPopoverData = {
      title: ticket.summary,
      readOnly: true,
      ticketKey: ticket.key,
      ticketStatus: ticket.status,
      jiraUrl: jiraSiteUrl
        ? `${jiraSiteUrl.replace(/\/$/, "")}/browse/${ticket.key}`
        : undefined,
    };
    setPopover({ data, anchor, entryId: null });
  };

  const editingEntry = entries.find((e) => e.id === editingEntryId) ?? null;

  // The modal shows either an existing entry being edited, or an in-progress
  // draft (new blank slot) that hasn't been saved to the DB yet.
  const modalEntry: EditableEntry | null = editingEntry
    ? editingEntry
    : draftEntry
      ? {
          id: null,
          start: draftEntry.start.toISOString(),
          end: draftEntry.end.toISOString(),
          title: null,
          comment: null,
          syncedToJira: false,
          lastSyncError: null,
          ticket: draftEntry.ticketId
            ? (tickets.find((t) => t.id === draftEntry.ticketId) ?? null)
            : null,
        }
      : null;

  const calendarEvents: CalendarEventItem[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.ticket ? entry.ticket.key : entry.title?.trim() || "Unassigned",
    duration: formatDuration(entry.start, entry.end),
    start: new Date(entry.start),
    end: new Date(entry.end),
    color: entry.ticket?.color ?? "#9ca3af",
    unassigned: !entry.ticket,
    synced: entry.syncedToJira,
    syncError: entry.lastSyncError,
    ticketKey: entry.ticket?.key,
    ticketStatus: entry.ticket?.status,
    syncing: syncingIds.has(entry.id),
    resourceId: "time",
  }));

  // Show a semi-transparent outline at the draft's slot while the "new
  // entry" modal is open and it hasn't been saved to the DB yet.
  if (draftEntry) {
    calendarEvents.push({
      id: "__draft__",
      title: "New entry…",
      start: draftEntry.start,
      end: draftEntry.end,
      color: "transparent",
      synced: false,
      pending: true,
      syncing: syncingIds.has("__draft__"),
      resourceId: "time",
    });
  }

  // Total logged hours per day, shown on each of the calendar's day headers.
  const workedMinutesByDay = new Map<string, number>();
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.start));
    const minutes = (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000;
    workedMinutesByDay.set(key, (workedMinutesByDay.get(key) ?? 0) + minutes);
  }
  const dayHourTotals: Record<string, string> = {};
  for (let i = 0; i < 5; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const key = toDateKey(day);
    const workedHours = (workedMinutesByDay.get(key) ?? 0) / 60;
    if (workedHours > 0) dayHourTotals[key] = formatHours(workedHours);
  }

  const googleCalendarEvents: CalendarEventItem[] = googleEvents
    .filter((event) => !event.allDay)
    .map((event) => ({
      id: `google-${event.id}`,
      title: event.title,
      start: new Date(event.start),
      end: new Date(event.end),
      color: "#e5e7eb",
      synced: true,
      readOnly: true,
      googleLink: event.htmlLink,
      resourceId: "google",
    }));

  return (
    <div className="flex h-screen flex-col">
      <AppHeader
        active="calendar"
        extra={
          jiraConnected === false && (
            <Link
              href="/settings"
              className="nb-btn nb-btn-pink px-4 py-2 text-sm"
            >
              Connect Jira in Settings
            </Link>
          )
        }
      />

      <Toast message={error} onDismiss={dismissErrorToast} />

      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <div className="flex flex-wrap items-center gap-3 border-b border-nb-ink/10 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
              sidebarOpen
                ? "border-nb-ink/30 bg-nb-green/25 text-nb-ink"
                : "border-nb-ink/15 text-nb-ink/70 hover:border-nb-ink/30 hover:text-nb-ink"
            }`}
          >
            🎫 Tickets{tickets.length > 0 ? ` (${tickets.length})` : ""}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className={`h-4 w-4 transition-transform ${sidebarOpen ? "rotate-90" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleToday} className="nb-btn px-3 py-1.5 text-sm">
              Today
            </button>
            <button type="button" onClick={handleBack} className="nb-btn px-3 py-1.5 text-sm">
              Back
            </button>
            <button type="button" onClick={handleNextWeek} className="nb-btn px-3 py-1.5 text-sm">
              Next
            </button>
          </div>
          <span className="ml-1 text-sm font-bold text-nb-ink/70">
            {isMobile ? (
              formatDayLabel(currentDate)
            ) : (
              <>
                {formatWeekLabel(weekStart)}{" "}
                <span className="text-nb-ink/40">· Week {getISOWeekNumber(weekStart)}</span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="nb-btn ml-auto px-3 py-1.5 text-sm"
          >
            📊 Summary
          </button>
        </div>
        <div className="relative flex flex-1 overflow-hidden">
          {sidebarOpen && (
            <>
              {/* Backdrop: only needed on mobile, where the sidebar becomes
                  an overlay drawer instead of sitting inline next to the
                  calendar (there's no room for both on a narrow screen). */}
              <div
                className="absolute inset-0 z-20 bg-black/40 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <TicketSidebar
                tickets={tickets}
                userId={userId}
                loading={loadingTickets}
                syncing={syncing}
                onDragStartTicket={setDraggedTicketId}
                onSelectTicket={handleSelectTicket}
                jql={ticketJql}
                defaultJql={ticketDefaultJql}
                onSaveJql={handleSaveJql}
              />
            </>
          )}
          <TimeCalendar
            events={calendarEvents}
            googleEvents={googleCalendarEvents}
            googleConnected={googleConnected ?? false}
            date={currentDate}
            dayHourTotals={dayHourTotals}
            onNavigate={setCurrentDate}
            onEventChange={handleEventChange}
            onDropTicket={handleDropTicket}
            onCreateBlankEvent={handleCreateBlankEvent}
            onSelectEvent={handleSelectEvent}
            draggedTicketId={draggedTicketId}
          />
        </div>
      </div>

      {modalEntry && (
        <EventEditorModal
          entry={modalEntry}
          tickets={tickets}
          autoFocusDescription={Boolean(draftEntry?.ticketId)}
          onClose={() => {
            setEditingEntryId(null);
            setDraftEntry(null);
          }}
          onSave={
            modalEntry.id === null
              ? handleCreateEntry
              : (payload) => handleSaveEntry(modalEntry.id as string, payload)
          }
          onDelete={
            modalEntry.id === null
              ? async () => setDraftEntry(null)
              : () => handleDeleteEntry(modalEntry.id as string)
          }
          onLookupTicket={handleLookupTicket}
        />
      )}

      {popover && (
        <EventPopover
          data={popover.data}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onEdit={
            popover.entryId
              ? () => {
                  setEditingEntryId(popover.entryId);
                  setPopover(null);
                }
              : undefined
          }
          onDelete={
            popover.entryId
              ? () => {
                  const entryId = popover.entryId as string;
                  setPopover(null);
                  handleDeleteEntry(entryId);
                }
              : undefined
          }
          onResync={
            popover.entryId && popover.data.ticketKey
              ? () => {
                  const entryId = popover.entryId as string;
                  setPopover(null);
                  handleResyncEntry(entryId);
                }
              : undefined
          }
        />
      )}

      {summaryOpen && <HoursSummaryModal onClose={() => setSummaryOpen(false)} />}
    </div>
  );
}
