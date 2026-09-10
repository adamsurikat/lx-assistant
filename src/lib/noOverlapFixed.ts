// react-big-calendar's built-in "no-overlap" dayLayoutAlgorithm has a known
// bug when combined with `resourceGroupingLayout` (two sub-columns per day
// here: "Time reporting" / "Google Calendar") — see
// https://github.com/bigcalendar/react-big-calendar/issues/2240. Its final
// "stretch to maximum width" pass only looks at each event's *direct*
// overlap neighbours ("friends") to decide whether it's the right-most
// column and can grow to fill the remaining width, instead of the full
// connected group of mutually-overlapping events computed a few lines
// earlier. That mismatch lets an event that isn't actually the right-most
// column in its group stretch to 100% width anyway, visually bleeding past
// its own resource's column boundary (e.g. a Google Calendar event
// overlapping the Time-reporting column next to it).
//
// This is a local copy of node_modules/react-big-calendar's own
// `no-overlap.js` with that one calculation fixed: instead of recomputing
// "the max idx among this event's direct friends", each event is tagged
// with the max idx of its *entire* connected group (already computed via
// the existing depth-first search below) and that's reused for the stretch
// check.
//
// `react-big-calendar` ships this algorithm as plain CommonJS with no
// published types (see src/types/react-big-calendar-internals.d.ts for a
// loose local declaration), and `no-overlap.js` itself imports the sibling
// `overlap.js` module the same way — the deep import path here is exactly
// what the library's own source uses internally, so it's stable for the
// installed version.
import type { DayLayoutFunction } from "react-big-calendar";
import overlapAlgorithm from "react-big-calendar/lib/utils/layout-algorithms/overlap";

interface StyledEvent {
  event: unknown;
  style: { top: number; height: number; width?: number | string; left?: number; xOffset?: number | string };
  friends?: StyledEvent[];
  idx?: number;
  size?: number;
  groupMaxIdx?: number;
}

interface LayoutArgs {
  events: unknown[];
  minimumStartDifference: number;
  slotMetrics: unknown;
  accessors: unknown;
}

function getMaxIdxDFS(node: StyledEvent, maxIdx: number, visited: StyledEvent[]): number {
  for (const friend of node.friends ?? []) {
    if (visited.indexOf(friend) > -1) continue;
    maxIdx = Math.max(maxIdx, friend.idx ?? 0);
    visited.push(friend);
    maxIdx = Math.max(maxIdx, getMaxIdxDFS(friend, maxIdx, visited));
  }
  return maxIdx;
}

function noOverlapFixed(args: LayoutArgs): Array<{ event: unknown; style: Record<string, number | string> }> {
  const styledEvents = (overlapAlgorithm as unknown as (args: LayoutArgs) => StyledEvent[])(args);

  styledEvents.sort((a, b) => {
    if (a.style.top !== b.style.top) return a.style.top > b.style.top ? 1 : -1;
    if (a.style.height !== b.style.height) return a.style.top + a.style.height < b.style.top + b.style.height ? 1 : -1;
    return 0;
  });

  for (const e of styledEvents) {
    e.friends = [];
    delete e.style.left;
    delete e.idx;
    delete e.size;
    delete e.groupMaxIdx;
  }

  // Small tolerance for the boundary comparisons below. `top`/`height` are
  // computed via independent floating-point divisions per event (see
  // react-big-calendar's TimeSlots.getRange), so two back-to-back events
  // (A ends exactly when B starts) can end up with e.g. A's computed end
  // at 15.90909090909091 and B's computed start at 15.909090909090908 —
  // identical in real terms but off by ~1e-15 due to rounding. Without this
  // epsilon, that tiny discrepancy makes `y3 < y2` true and falsely flags
  // adjacent, non-overlapping events as "friends", splitting them into
  // side-by-side half-width columns instead of each rendering full width.
  const EPSILON = 1e-9;

  for (let i = 0; i < styledEvents.length - 1; ++i) {
    const se1 = styledEvents[i];
    const y1 = se1.style.top;
    const y2 = se1.style.top + se1.style.height;
    for (let j = i + 1; j < styledEvents.length; ++j) {
      const se2 = styledEvents[j];
      const y3 = se2.style.top;
      const y4 = se2.style.top + se2.style.height;
      if (
        (y3 >= y1 && y4 <= y2 + EPSILON) ||
        (y4 > y1 + EPSILON && y4 <= y2 + EPSILON) ||
        (y3 >= y1 && y3 < y2 - EPSILON)
      ) {
        se1.friends!.push(se2);
        se2.friends!.push(se1);
      }
    }
  }

  for (const se of styledEvents) {
    const bitmap = new Array(100).fill(1);
    for (const friend of se.friends ?? []) {
      if (friend.idx !== undefined) bitmap[friend.idx] = 0;
    }
    se.idx = bitmap.indexOf(1);
  }

  for (const se of styledEvents) {
    if (se.size) continue;
    const allFriends: StyledEvent[] = [];
    const maxIdx = getMaxIdxDFS(se, 0, allFriends);
    const size = 100 / (maxIdx + 1);
    se.size = size;
    // The fix: tag every member of the connected group with the group's
    // real max idx up front, instead of letting the stretch pass below
    // recompute a (potentially smaller/wrong) max from direct friends only.
    se.groupMaxIdx = maxIdx;
    for (const friend of allFriends) {
      friend.size = size;
      friend.groupMaxIdx = maxIdx;
    }
  }

  const output: Array<{ event: unknown; style: Record<string, number | string> }> = [];
  for (const e of styledEvents) {
    e.style.left = (e.idx ?? 0) * (e.size ?? 100);

    // Stretch to maximum: only the right-most column in the whole
    // connected group should grow to fill the remaining width.
    if ((e.groupMaxIdx ?? 0) <= (e.idx ?? 0)) {
      e.size = 100 - (e.idx ?? 0) * (e.size ?? 100);
    }

    const padding = e.idx === 0 ? 0 : 3;
    output.push({
      event: e.event,
      style: {
        top: e.style.top,
        height: `calc(${e.style.height}% - 2px)`,
        width: `calc(${e.size}% - ${padding}px)`,
        xOffset: `calc(${e.style.left}% + ${padding}px)`,
      },
    });
  }

  return output;
}

// Cast to the library's own `DayLayoutFunction` shape at the boundary —
// internally this works with a loosely-typed `StyledEvent` (mirroring the
// untyped JS it patches) since react-big-calendar's real style objects
// carry extra non-standard fields (like `xOffset`) beyond `CSSProperties`.
// Generic re-export so callers get a `DayLayoutFunction<TEvent>` matching
// their own event type (e.g. `CalendarEventItem`), instead of `object`.
export function createNoOverlapFixed<TEvent extends object>(): DayLayoutFunction<TEvent> {
  return noOverlapFixed as unknown as DayLayoutFunction<TEvent>;
}

export default noOverlapFixed as unknown as DayLayoutFunction<object>;
