import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const BASELINE_HOURS_PER_WEEKDAY = 8;

export interface DailyHoursSummary {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 (Sun) .. 6 (Sat), matches Date#getDay()
  workedHours: number;
  expectedHours: number;
}

/**
 * Returns per-day worked-vs-expected hours for a given month, so the client
 * can show whether the user is ahead or behind an 8h/weekday baseline.
 * Weekends are never expected to have logged hours, and days later than
 * "today" don't count toward the expectation either (you can't be behind on
 * hours you haven't had a chance to work yet).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // "YYYY-MM"
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  }

  const rangeStart = new Date(year, month, 1, 0, 0, 0, 0);
  const rangeEnd = new Date(year, month + 1, 1, 0, 0, 0, 0);

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.user.id,
      start: { gte: rangeStart },
      end: { lte: rangeEnd },
    },
    select: { start: true, end: true },
  });

  const workedMinutesByDay = new Map<string, number>();
  for (const entry of entries) {
    const key = toDateKey(entry.start);
    const minutes = (entry.end.getTime() - entry.start.getTime()) / 60000;
    workedMinutesByDay.set(key, (workedMinutesByDay.get(key) ?? 0) + minutes);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DailyHoursSummary[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const isFuture = date.getTime() > today.getTime();
    const key = toDateKey(date);
    days.push({
      date: key,
      weekday,
      workedHours: (workedMinutesByDay.get(key) ?? 0) / 60,
      expectedHours: !isWeekend && !isFuture ? BASELINE_HOURS_PER_WEEKDAY : 0,
    });
  }

  const totals = days.reduce(
    (acc, d) => ({
      workedHours: acc.workedHours + d.workedHours,
      expectedHours: acc.expectedHours + d.expectedHours,
    }),
    { workedHours: 0, expectedHours: 0 }
  );

  return NextResponse.json({
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    days,
    totals: {
      ...totals,
      diffHours: totals.workedHours - totals.expectedHours,
    },
  });
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
