"use client";

interface TimeFieldProps {
  value: string; // "HH:MM:SS"
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A native <input type="time"> time picker, with step="1" so it captures
 * seconds too. Its `value`/`onChange` are always 24h "HH:MM:SS" regardless
 * of locale — only the browser's own popover UI renders 12h/24h per the
 * user's OS settings, which we don't control but also don't need to.
 */
export function TimeField({ value, onChange, className = "" }: TimeFieldProps) {
  return (
    <input
      type="time"
      step={1}
      value={value}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value);
      }}
      className={`nb-input px-3 py-1.5 text-sm ${className}`}
    />
  );
}
