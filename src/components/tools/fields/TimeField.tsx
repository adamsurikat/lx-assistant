"use client";

interface TimeFieldProps {
  value: string; // "HH:MM:SS"
  onChange: (value: string) => void;
  className?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES_SECONDS = Array.from({ length: 60 }, (_, i) => pad(i));

/**
 * A self-rendered 24-hour time picker (three <select> dropdowns) instead of
 * a native <input type="time">, whose 12h/24h display is tied to OS locale
 * settings and can't be forced via `lang`.
 */
export function TimeField({ value, onChange, className = "" }: TimeFieldProps) {
  const [hh, mm, ss] = value.split(":");

  const update = (partial: Partial<{ hh: string; mm: string; ss: string }>) => {
    onChange(`${partial.hh ?? hh ?? "00"}:${partial.mm ?? mm ?? "00"}:${partial.ss ?? ss ?? "00"}`);
  };

  return (
    <span className={`nb-input inline-flex items-center gap-1 px-2 py-1.5 text-sm ${className}`}>
      <select
        value={hh ?? "00"}
        onChange={(e) => update({ hh: e.target.value })}
        className="bg-transparent focus:outline-none"
        aria-label="Hour"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span>:</span>
      <select
        value={mm ?? "00"}
        onChange={(e) => update({ mm: e.target.value })}
        className="bg-transparent focus:outline-none"
        aria-label="Minute"
      >
        {MINUTES_SECONDS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <span>:</span>
      <select
        value={ss ?? "00"}
        onChange={(e) => update({ ss: e.target.value })}
        className="bg-transparent focus:outline-none"
        aria-label="Second"
      >
        {MINUTES_SECONDS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </span>
  );
}
