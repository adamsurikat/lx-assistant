"use client";

import { useEffect, useRef, useState } from "react";

interface DateFieldProps {
  year: string;
  month: string;
  day: string;
  onChange: (value: { year: string; month: string; day: string }) => void;
  className?: string;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toParts(year: string, month: string, day: string) {
  return {
    y: Number.parseInt(year, 10) || 1970,
    m: Number.parseInt(month, 10) || 1,
    d: Number.parseInt(day, 10) || 1,
  };
}

// Plain calendar-math helpers (no Date/timezone involved) so a "day" here is
// always the abstract calendar date the user picked, not a real instant.
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekdayOfMonth(year: number, month: number): number {
  // JS Date#getDay() is 0=Sun..6=Sat; convert to a Monday-first index.
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

/**
 * A self-rendered calendar date picker (day/month/year all formatted by us)
 * instead of a native <input type="date">, whose displayed format is tied to
 * OS locale settings and can't be forced to dd/mm/yyyy via `lang`.
 */
export function DateField({ year, month, day, onChange, className = "" }: DateFieldProps) {
  const { y: selectedYear, m: selectedMonth, d: selectedDay } = toParts(year, month, day);
  const [viewYear, setViewYear] = useState(selectedYear);
  const [viewMonth, setViewMonth] = useState(selectedMonth);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setViewYear(selectedYear);
      setViewMonth(selectedMonth);
    }
    // Only re-sync the visible month when the popover opens, not on every
    // keystroke elsewhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const label = `${selectedDay.toString().padStart(2, "0")}/${selectedMonth
    .toString()
    .padStart(2, "0")}/${selectedYear.toString().padStart(4, "0")}`;

  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const leadingBlanks = firstWeekdayOfMonth(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  return (
    <span className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nb-input flex items-center gap-2 px-3 py-1.5 text-sm"
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4 text-nb-ink/50"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path strokeLinecap="round" d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="nb-panel-sm absolute z-50 mt-1 w-64 bg-white p-2 text-left"
        >
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="nb-btn px-2 py-1 text-xs"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-semibold">
              {MONTH_LABELS[viewMonth - 1]} {viewYear}
            </span>
            <button
              type="button"
              onClick={goToNextMonth}
              className="nb-btn px-2 py-1 text-xs"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-nb-ink/40">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const isSelected = d === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange({
                      year: viewYear.toString().padStart(4, "0"),
                      month: viewMonth.toString().padStart(2, "0"),
                      day: d.toString().padStart(2, "0"),
                    });
                    setOpen(false);
                  }}
                  className={`rounded-md px-1 py-1 text-xs font-medium ${
                    isSelected
                      ? "bg-nb-orange text-white"
                      : "text-nb-ink hover:bg-nb-orange/10"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}
