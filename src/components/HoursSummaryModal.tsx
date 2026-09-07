"use client";

import { useEffect, useState } from "react";

interface DailyHoursSummary {
  date: string;
  weekday: number;
  workedHours: number;
  expectedHours: number;
}

interface SummaryResponse {
  month: string;
  days: DailyHoursSummary[];
  totals: { workedHours: number; expectedHours: number; diffHours: number };
}

interface HoursSummaryModalProps {
  onClose: () => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Formats a fractional hour count as e.g. "1h 30m" or "45m". */
function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Modal showing worked-vs-expected hours for a given month (8h/weekday
 * baseline), so the user can see at a glance whether they're ahead or
 * behind, with a per-day breakdown table.
 */
export function HoursSummaryModal({ onClose }: HoursSummaryModalProps) {
  const [monthKey, setMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/time-entries/summary?month=${monthKey}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  // Considered "loading" whenever we don't yet have a response matching the
  // currently-selected month (rather than a separate setState-in-effect flag).
  const loading = !data || data.month !== monthKey;

  const shiftMonth = (delta: number) => {
    const [year, month] = monthKey.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    setMonthKey(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  const diff = data?.totals.diffHours ?? 0;
  const diffLabel = diff >= 0 ? `+${formatHours(diff)} ahead` : `${formatHours(diff)} behind`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="nb-panel flex max-h-[85vh] w-full max-w-lg flex-col bg-white p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="nb-display text-lg">📊 Worked hours summary</h2>
          <button onClick={onClose} className="nb-btn px-3 py-1 text-xs">
            Close
          </button>
        </div>

        <div className="mb-4 flex items-center justify-center gap-3">
          <button type="button" onClick={() => shiftMonth(-1)} className="nb-btn px-3 py-1.5 text-sm">
            ← Prev
          </button>
          <span className="min-w-[10rem] text-center text-sm font-bold text-nb-ink/80">
            {data ? monthLabel(data.month) : monthLabel(monthKey)}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} className="nb-btn px-3 py-1.5 text-sm">
            Next →
          </button>
        </div>

        {loading && <p className="text-sm font-medium text-nb-ink/50">Loading…</p>}

        {!loading && data && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[10px] border border-nb-ink/10 bg-nb-paper p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-nb-ink/50">
                  Worked
                </p>
                <p className="text-lg font-bold">{formatHours(data.totals.workedHours)}</p>
              </div>
              <div className="rounded-[10px] border border-nb-ink/10 bg-nb-paper p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-nb-ink/50">
                  Expected
                </p>
                <p className="text-lg font-bold">{formatHours(data.totals.expectedHours)}</p>
              </div>
              <div
                className={`rounded-[10px] border border-nb-ink/10 p-3 shadow-sm ${
                  diff >= 0 ? "bg-nb-green" : "bg-nb-pink text-white"
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    diff >= 0 ? "text-nb-ink/60" : "text-white/80"
                  }`}
                >
                  Difference
                </p>
                <p className="text-lg font-bold">{diffLabel}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs font-semibold uppercase tracking-wide text-nb-ink/50">
                  <tr>
                    <th className="py-1">Date</th>
                    <th className="py-1">Worked</th>
                    <th className="py-1">Expected</th>
                    <th className="py-1">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day) => {
                    const isWeekend = day.weekday === 0 || day.weekday === 6;
                    const dayDiff = day.workedHours - day.expectedHours;
                    const dateObj = new Date(`${day.date}T00:00:00`);
                    return (
                      <tr
                        key={day.date}
                        className={`border-t border-nb-ink/10 ${
                          isWeekend ? "text-nb-ink/40" : "text-nb-ink"
                        }`}
                      >
                        <td className="py-1">
                          {WEEKDAY_LABELS[day.weekday]} {dateObj.getDate()}
                        </td>
                        <td className="py-1">
                          {day.workedHours > 0 ? formatHours(day.workedHours) : "—"}
                        </td>
                        <td className="py-1">
                          {day.expectedHours > 0 ? formatHours(day.expectedHours) : "—"}
                        </td>
                        <td
                          className={`py-1 font-semibold ${
                            day.expectedHours === 0
                              ? "text-nb-ink/30"
                              : dayDiff >= 0
                                ? "text-green-700"
                                : "text-red-700"
                          }`}
                        >
                          {day.expectedHours === 0 ? "—" : formatHours(dayDiff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
