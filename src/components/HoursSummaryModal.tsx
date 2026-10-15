"use client";

import { Fragment, useEffect, useState } from "react";
import { getISOWeek } from "date-fns/getISOWeek";
import type { HoursSummaryResponse, HoursTotals } from "@/lib/hoursSummary";

interface HoursSummaryModalProps {
  onClose: () => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Formats a fractional hour count as e.g. "1h 30m" or "45m". */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function monthLabel(monthKey: string, includeYear = true): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

function formatDiff(hours: number): string {
  return hours > 0 ? `+${formatHours(hours)}` : formatHours(hours);
}

function diffColor(hours: number): string {
  return hours < 0 ? "text-red-700" : hours > 0 ? "text-green-700" : "text-nb-ink/50";
}

function TotalCards({ totals, label }: { totals: HoursTotals; label: string }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-[10px] border border-nb-ink/10 bg-nb-paper p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-nb-ink/50">Worked</p>
        <p className="text-base font-bold sm:text-lg">{formatHours(totals.workedHours)}</p>
      </div>
      <div className="rounded-[10px] border border-nb-ink/10 bg-nb-paper p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-nb-ink/50">Expected</p>
        <p className="text-base font-bold sm:text-lg">{formatHours(totals.expectedHours)}</p>
      </div>
      <div className={`rounded-[10px] border border-nb-ink/10 p-3 shadow-sm ${totals.diffHours >= 0 ? "bg-nb-green" : "bg-nb-pink text-white"}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${totals.diffHours >= 0 ? "text-nb-ink/60" : "text-white/80"}`}>
          {label}
        </p>
        <p className="text-base font-bold sm:text-lg">{formatDiff(totals.diffHours)}</p>
      </div>
    </div>
  );
}

/** Year and month summaries share one annual response. */
export function HoursSummaryModal({ onClose }: HoursSummaryModalProps) {
  const [monthKey, setMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [result, setResult] = useState<{
    key: string;
    data?: HoursSummaryResponse;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const year = Number(monthKey.slice(0, 4));
  const query = `year=${year}`;
  const requestKey = `${query}&retry=${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/time-entries/summary?${query}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load the hours summary. Please try again.");
        return (await res.json()) as HoursSummaryResponse;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            key: requestKey,
            error: error instanceof Error ? error.message : "Could not load the hours summary.",
          });
        }
      });
    return () => controller.abort();
  }, [query, requestKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const loading = result?.key !== requestKey;
  const data = loading ? undefined : result?.data;
  const error = loading ? undefined : result?.error;
  const selectedMonth = data?.months.find((month) => month.month === monthKey);
  const weekdays = data?.days.filter((day) => day.date.startsWith(monthKey) && day.weekday !== 0 && day.weekday !== 6) ?? [];

  const shiftMonth = (delta: number) => {
    const [year, month] = monthKey.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    setMonthKey(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hours-summary-title"
        className="nb-panel flex max-h-[90vh] w-full max-w-6xl flex-col bg-white p-5 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="hours-summary-title" className="nb-display text-lg">📊 Worked hours summary</h2>
          <button type="button" onClick={onClose} className="nb-btn px-3 py-1 text-xs">Close</button>
        </div>

        <p className="mb-4 text-xs text-nb-ink/60">
          8h per weekday with logged work. Empty days, today and future days are excluded from totals.
          Weekend work does not affect the difference.
        </p>

        {loading && <p role="status" className="mb-4 text-sm font-medium text-nb-ink/50">Loading…</p>}
        {error && (
          <div role="alert" className="mb-4 text-sm text-red-700">
            <p>{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="nb-btn mt-2 px-3 py-1.5 text-sm">Retry</button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          <section data-testid="month-summary" aria-labelledby="month-summary-title" className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="nb-btn px-3 py-1.5 text-sm">← Prev</button>
              <h3 id="month-summary-title" className="text-center text-sm font-bold text-nb-ink/80" aria-live="polite">{monthLabel(monthKey)}</h3>
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="nb-btn px-3 py-1.5 text-sm">Next →</button>
            </div>
            {selectedMonth && (
              <>
                <TotalCards totals={selectedMonth.totals} label="Monthly diff" />
                <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-xs font-semibold uppercase tracking-wide text-nb-ink/50">
                      <tr>
                        <th scope="col" className="py-1">Date</th>
                        <th scope="col" className="py-1">Worked</th>
                        <th scope="col" className="py-1">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekdays.map((day, index) => {
                        const dateObj = new Date(`${day.date}T00:00:00`);
                        const weekNumber = getISOWeek(dateObj);
                        const prevWeekNumber = index > 0 ? getISOWeek(new Date(`${weekdays[index - 1].date}T00:00:00`)) : null;
                        return (
                          <Fragment key={day.date}>
                            {weekNumber !== prevWeekNumber && (
                              <tr>
                                <td colSpan={3} className="bg-nb-paper pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-nb-ink/50">Week {weekNumber}</td>
                              </tr>
                            )}
                            <tr className="border-t border-nb-ink/10 text-nb-ink">
                              <td className="py-1">{WEEKDAY_LABELS[day.weekday]} {dateObj.getDate()}</td>
                              <td className="py-1">{day.workedHours > 0 ? formatHours(day.workedHours) : "—"}</td>
                              <td className={`py-1 font-semibold ${day.diffHours === null ? "text-nb-ink/30" : diffColor(day.diffHours)}`}>
                                {day.diffHours === null ? "—" : formatDiff(day.diffHours)}
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section data-testid="year-summary" aria-labelledby="year-summary-title" className="min-w-0 border-t border-nb-ink/10 pt-6 lg:flex lg:min-h-0 lg:flex-col lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button type="button" aria-label="Previous year" onClick={() => shiftMonth(-12)} className="nb-btn px-3 py-1.5 text-sm">← Prev</button>
              <h3 id="year-summary-title" className="text-center text-sm font-bold text-nb-ink/80" aria-live="polite">{year} · Year</h3>
              <button type="button" aria-label="Next year" onClick={() => shiftMonth(12)} className="nb-btn px-3 py-1.5 text-sm">Next →</button>
            </div>
            {data && (
              <>
                <TotalCards totals={data.totals} label="Yearly diff" />
                <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-xs font-semibold uppercase tracking-wide text-nb-ink/50">
                      <tr>
                        <th scope="col" className="py-1">Month</th>
                        <th scope="col" className="py-1">Worked</th>
                        <th scope="col" className="py-1">Expected</th>
                        <th scope="col" className="py-1">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.months.map((month) => (
                        <tr key={month.month} className={`border-t border-nb-ink/10 text-nb-ink ${month.month === monthKey ? "bg-nb-green/10" : ""}`}>
                          <th scope="row" className="py-2 text-left font-medium">
                            <button
                              type="button"
                              aria-label={`View ${monthLabel(month.month)}`}
                              aria-pressed={month.month === monthKey}
                              className="underline decoration-nb-ink/30 underline-offset-4 hover:decoration-nb-ink"
                              onClick={() => setMonthKey(month.month)}
                            >
                              {monthLabel(month.month, false)}
                            </button>
                          </th>
                          <td className="py-2">{formatHours(month.totals.workedHours)}</td>
                          <td className="py-2">{formatHours(month.totals.expectedHours)}</td>
                          <td className={`py-2 font-semibold ${diffColor(month.totals.diffHours)}`}>{formatDiff(month.totals.diffHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
