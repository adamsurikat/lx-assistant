"use client";

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
  placeholder?: string;
}

export function TextField({ value, onChange, maxLength, className = "", placeholder }: TextFieldProps) {
  return (
    <input
      type="text"
      className={`nb-input px-3 py-1.5 text-sm ${className}`}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
