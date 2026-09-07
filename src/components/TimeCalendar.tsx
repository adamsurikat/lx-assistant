"use client";

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
}

interface TimeCalendarProps {
  events: CalendarEventItem[];
  onEventChange: (id: string, start: Date, end: Date) => void;
  onDropTicket: (ticketId: string, start: Date, end: Date) => void;
  onCreateBlankEvent: (start: Date, end: Date) => void;
  onSelectEvent: (id: string) => void;
  draggedTicketId: string | null;
}

export function TimeCalendar({
  events,
  onEventChange,
  onDropTicket,
  onCreateBlankEvent,
  onSelectEvent,
  draggedTicketId,
}: TimeCalendarProps) {
  return (
    <div className="h-full flex-1 bg-white p-4">
      <DnDCalendar
        localizer={localizer}
        events={events}
        defaultView="week"
        views={["week"]}
        step={15}
        timeslots={4}
        min={MIN_TIME}
        max={MAX_TIME}
        style={{ height: "100%" }}
        resizable
        selectable
        popup
        onEventDrop={({ event, start, end }: EventInteractionArgs<CalendarEventItem>) =>
          onEventChange(event.id, new Date(start), new Date(end))
        }
        onEventResize={({ event, start, end }: EventInteractionArgs<CalendarEventItem>) =>
          onEventChange(event.id, new Date(start), new Date(end))
        }
        onSelectEvent={(event: CalendarEventItem) => onSelectEvent(event.id)}
        onSelectSlot={(slotInfo) => {
          onCreateBlankEvent(new Date(slotInfo.start), new Date(slotInfo.end));
        }}
        onDropFromOutside={({ start, end }) => {
          if (!draggedTicketId) return;
          onDropTicket(draggedTicketId, new Date(start), new Date(end));
        }}
        dragFromOutsideItem={makeDragPreviewItem}
        eventPropGetter={(event: CalendarEventItem) => ({
          style: {
            backgroundColor: event.color,
            borderColor: event.color,
            opacity: event.syncError ? 0.6 : 1,
            border: event.syncError
              ? "2px dashed #dc2626"
              : event.unassigned
                ? "2px dashed #9ca3af"
                : undefined,
          },
        })}
      />
    </div>
  );
}
