const BASELINE_HOURS_PER_WEEKDAY = 8;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface DailyHoursSummary {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 (Sun) .. 6 (Sat), matches Date#getDay()
  workedHours: number;
  expectedHours: number;
  // Null for empty days, weekends, and incomplete days.
  diffHours: number | null;
}

export interface HoursTotals {
  workedHours: number;
  expectedHours: number;
  diffHours: number;
}

export interface MonthlyHoursSummary {
  month: string; // YYYY-MM
  totals: HoursTotals;
}

export interface HoursSummaryResponse {
  period: "year" | "month";
  year: number;
  month: string | null;
  days: DailyHoursSummary[];
  months: MonthlyHoursSummary[];
  totals: HoursTotals;
}

interface HoursSummaryOptions {
  entries: Array<{ start: Date; end: Date }>;
  year: number;
  month?: number; // 1 .. 12; omit for the entire year.
  now?: Date;
}

function localDate(year: number, monthIndex: number, day = 1): Date {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  // setFullYear also handles years below 100 without adding 1900.
  date.setFullYear(year, monthIndex, day);
  return date;
}

export function getHoursSummaryRange(year: number, month?: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Year must be between 0001 and 9999.");
  }
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new RangeError("Month must be between 01 and 12.");
  }

  return {
    rangeStart: localDate(year, month === undefined ? 0 : month - 1),
    rangeEnd: month === undefined ? localDate(year + 1, 0) : localDate(year, month),
  };
}

function toMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function toDateKey(date: Date): string {
  return `${toMonthKey(date.getFullYear(), date.getMonth() + 1)}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyTotals(): HoursTotals {
  return { workedHours: 0, expectedHours: 0, diffHours: 0 };
}

/**
 * Summarize completed worked days against an eight-hour weekday baseline.
 * Empty days are always excluded. Dates use the server's local timezone,
 * matching the calendar summary's existing rules.
 * Weekend work appears in worked totals but never changes the weekday diff.
 */
export function buildHoursSummary({
  entries,
  year,
  month,
  now = new Date(),
}: HoursSummaryOptions): HoursSummaryResponse {
  const { rangeStart, rangeEnd } = getHoursSummaryRange(year, month);
  const workedHoursByDay = new Map<string, number>();

  for (const entry of entries) {
    let cursor = Math.max(entry.start.getTime(), rangeStart.getTime());
    const end = Math.min(entry.end.getTime(), rangeEnd.getTime());

    // Clip boundary-crossing entries, then assign each portion to its local
    // day. Advancing by midnight rather than 24h also handles DST changes.
    while (cursor < end) {
      const day = new Date(cursor);
      const nextMidnight = new Date(cursor);
      nextMidnight.setHours(24, 0, 0, 0);
      const segmentEnd = Math.min(nextMidnight.getTime(), end);
      const key = toDateKey(day);
      const hours = (segmentEnd - cursor) / MILLISECONDS_PER_HOUR;
      workedHoursByDay.set(key, (workedHoursByDay.get(key) ?? 0) + hours);
      cursor = segmentEnd;
    }
  }

  const today = localDate(now.getFullYear(), now.getMonth(), now.getDate());
  const firstMonth = month ?? 1;
  const lastMonth = month ?? 12;
  const months: MonthlyHoursSummary[] = [];
  for (let selectedMonth = firstMonth; selectedMonth <= lastMonth; selectedMonth++) {
    months.push({ month: toMonthKey(year, selectedMonth), totals: emptyTotals() });
  }

  const days: DailyHoursSummary[] = [];
  for (const date = new Date(rangeStart); date < rangeEnd; date.setDate(date.getDate() + 1)) {
    const key = toDateKey(date);
    const weekday = date.getDay();
    const workedHours = workedHoursByDay.get(key) ?? 0;
    const isComplete = date < today;
    const countsTowardDiff = isComplete && weekday !== 0 && weekday !== 6 && workedHours > 0;
    const expectedHours = countsTowardDiff ? BASELINE_HOURS_PER_WEEKDAY : 0;
    const diffHours = countsTowardDiff ? workedHours - expectedHours : null;
    days.push({ date: key, weekday, workedHours, expectedHours, diffHours });

    const totals = months[date.getMonth() + 1 - firstMonth].totals;
    totals.workedHours += isComplete ? workedHours : 0;
    totals.expectedHours += expectedHours;
    totals.diffHours += diffHours ?? 0;
  }

  const totals = months.reduce((sum, selectedMonth) => ({
    workedHours: sum.workedHours + selectedMonth.totals.workedHours,
    expectedHours: sum.expectedHours + selectedMonth.totals.expectedHours,
    diffHours: sum.diffHours + selectedMonth.totals.diffHours,
  }), emptyTotals());

  return {
    period: month === undefined ? "year" : "month",
    year,
    month: month === undefined ? null : toMonthKey(year, month),
    days,
    months,
    totals,
  };
}
