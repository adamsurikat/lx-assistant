"use client";

interface ModeTabsProps<T extends string> {
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}

/** Small pill tab group used for a tool's mode switches (e.g. Encode/Decode). */
export function ModeTabs<T extends string>({ value, options, onChange }: ModeTabsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`nb-btn px-3 py-1 text-xs ${value === option.key ? "nb-btn-green" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
