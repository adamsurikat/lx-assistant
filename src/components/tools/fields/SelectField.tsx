"use client";

interface SelectFieldProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  className?: string;
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: SelectFieldProps<T>) {
  return (
    <select
      className={`nb-input px-3 py-1.5 text-sm ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
