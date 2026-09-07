"use client";

import type { SyntheticEvent } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop, {
  type EventInteractionArgs,
} from "react-big-calendar/lib/addons/dragAndDrop";
import { format } from "date-fns/format";
import { parse } from "date-fns/parse";
import { startOfWeek } from "date-fns/startOfWeek";
import { getDay } from "date-fns/getDay";
import { enUS } from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop<CalendarEventItem>(Calendar);

// Restrict the week/day view's visible time range to 07:00–18:00. The Date
// objects' year/month/day are irrelevant to react-big-calendar; only the
// hours/minutes are used.
const MIN_TIME = new Date(1970, 0, 1, 7, 0, 0);
const MAX_TIME = new Date(1970, 0, 1, 18, 0, 0);

// Default duration (minutes) applied when a ticket is dropped onto the
// calendar from the sidebar.
const DEFAULT_DROP_DURATION_MINUTES = 30;

// The dragAndDrop addon calls dragFromOutsideItem() internally to work out
// the dropped event's duration (and to render the drag preview) — without
// this prop it throws and the drop is silently lost, so a placeholder event
// with a sensible default duration must always be returned here.
function makeDragPreviewItem(): CalendarEventItem {
  const start = new Date();
  const end = new Date(start.getTime() + DEFAULT_DROP_DURATION_MINUTES * 60_000);
  return {
    id: "__drag-preview__",
    title: "",
    start,
    end,
    color: "#6366f1",
    synced: false,
    resourceId: "time",
  };
}

export interface CalendarEventItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  synced: boolean;
  syncError?: string | null;
  unassigned?: boolean;
  // True for read-only overlay events sourced from Google Calendar — these
  // can't be dragged, resized, or opened in the editor modal.
  readOnly?: boolean;
  googleLink?: string;
  ticketKey?: string;
  ticketStatus?: string;
  // Which half of the day column this event renders in.
  resourceId: "time" | "google";
}

// Splits each day into two side-by-side sub-columns: one for logged/loggable
// time entries, one read-only column showing Google Calendar meetings.
const RESOURCES = [
  { id: "time", title: "Time reporting" },
  { id: "google", title: "Google Calendar" },
];

interface TimeCalendarProps {
  events: CalendarEventItem[];
  googleEvents: CalendarEventItem[];
  onEventChange: (id: string, start: Date, end: Date) => void;
  onDropTicket: (ticketId: string, start: Date, end: Date) => void;
  onCreateBlankEvent: (start: Date, end: Date) => void;
  onSelectEvent: (event: CalendarEventItem, domEvent: SyntheticEvent<HTMLElement>) => void;
  draggedTicketId: string | null;
}

export function TimeCalendar({
  events,
  googleEvents,
  onEventChange,
  onDropTicket,
  onCreateBlankEvent,
  onSelectEvent,
  draggedTicketId,
}: TimeCalendarProps) {
  const allEvents = [...events, ...googleEvents];
  return (
    <div className="h-full flex-1 bg-nb-paper p-3">
      <DnDCalendar
        localizer={localizer}
        events={allEvents}
        resources={RESOURCES}
        resourceGroupingLayout
        defaultView="work_week"
        views={["work_week"]}
        step={15}
        timeslots={4}
        min={MIN_TIME}
        max={MAX_TIME}
        style={{ height: "100%" }}
        resizable
        selectable
        popup
        draggableAccessor={(event: CalendarEventItem) => !event.readOnly}
        resizableAccessor={(event: CalendarEventItem) => !event.readOnly}
        onEventDrop={({ event, start, end }: EventInteractionArgs<CalendarEventItem>) =>
          onEventChange(event.id, new Date(start), new Date(end))
        }
        onEventResize={({ event, start, end }: EventInteractionArgs<CalendarEventItem>) =>
          onEventChange(event.id, new Date(start), new Date(end))
        }
        onSelectEvent={(event: CalendarEventItem, domEvent) => onSelectEvent(event, domEvent)}
        onSelectSlot={(slotInfo) => {
          // The "Google Calendar" sub-column is read-only/view-only — time
          // entries can only be created in the "Time reporting" column.
          if (slotInfo.resourceId === "google") return;
          onCreateBlankEvent(new Date(slotInfo.start), new Date(slotInfo.end));
        }}
        onDropFromOutside={({ start, end, resource }) => {
          if (!draggedTicketId || resource === "google") return;
          onDropTicket(draggedTicketId, new Date(start), new Date(end));
        }}
        dragFromOutsideItem={makeDragPreviewItem}
        eventPropGetter={(event: CalendarEventItem) => ({
          style: {
            backgroundColor: event.readOnly ? "#cdeede" : event.color,
            color: event.readOnly ? "#111111" : event.unassigned ? "#111111" : "#fff",
            opacity: event.syncError ? 0.6 : 1,
            cursor: event.readOnly ? "pointer" : undefined,
            outline:
              event.syncError || event.unassigned ? "1px dashed rgba(17,17,17,0.4)" : undefined,
            outlineOffset: "-1px",
          },
        })}
      />
    </div>
  );
}
