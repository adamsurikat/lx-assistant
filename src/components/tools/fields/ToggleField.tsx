"use client";

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onToggle: () => void;
}

export function ToggleField({ label, value, onToggle }: ToggleFieldProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={value}
      className={`nb-btn px-3 py-1.5 text-sm ${value ? "nb-btn-green" : ""}`}
    >
      {label}
    </button>
  );
}
