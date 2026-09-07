"use client";

import { CopyPasteButtons } from "./CopyPasteButtons";

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
  placeholder?: string;
}

export function TextField({ value, onChange, maxLength, className = "", placeholder }: TextFieldProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <input
        type="text"
        className="nb-input w-full min-w-0 flex-1 px-3 py-1.5 text-sm"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <CopyPasteButtons value={value} onPaste={onChange} />
    </span>
  );
}
