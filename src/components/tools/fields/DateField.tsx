"use client";

interface DateFieldProps {
  year: string;
  month: string;
  day: string;
  onChange: (value: { year: string; month: string; day: string }) => void;
  className?: string;
}

function toParts(year: string, month: string, day: string) {
  return {
    y: Number.parseInt(year, 10) || 1970,
    m: Number.parseInt(month, 10) || 1,
    d: Number.parseInt(day, 10) || 1,
  };
}

/**
 * A native <input type="date"> date picker. The input's `value` is always
 * ISO (yyyy-mm-dd) regardless of locale — only the browser's own popover UI
 * renders it in the user's locale/OS format, which we don't control but also
 * don't need to since we never parse that display format ourselves.
 */
export function DateField({ year, month, day, onChange, className = "" }: DateFieldProps) {
  const { y, m, d } = toParts(year, month, day);
  const value = `${y.toString().padStart(4, "0")}-${m
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value; // "yyyy-mm-dd", or "" if cleared
    if (!next) return;
    const [ny, nm, nd] = next.split("-");
    onChange({ year: ny, month: nm, day: nd });
  };

  return (
    <input
      type="date"
      value={value}
      onChange={handleChange}
      className={`nb-input px-3 py-1.5 text-sm ${className}`}
    />
  );
}
