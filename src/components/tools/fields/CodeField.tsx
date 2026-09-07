"use client";

import { useEffect, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";

interface CodeFieldProps {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  status?: "valid" | "invalid";
  height?: string;
}

/**
 * A code-style textarea (CodeMirror) used across the developer tools page,
 * with a copy-to-clipboard button and an optional valid/invalid badge.
 */
export function CodeField({ value, onChange, disabled, status, height = "190px" }: CodeFieldProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div
      className={`relative overflow-hidden rounded-[10px] border ${
        disabled ? "border-nb-ink/10 bg-nb-ink/5" : "border-nb-ink/15 bg-white"
      }`}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={disabled}
        editable={!disabled}
        extensions={[EditorView.lineWrapping]}
        height={height}
        basicSetup={{ highlightActiveLine: false, highlightActiveLineGutter: false }}
      />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value ?? "");
          setCopied(true);
        }}
        className="nb-btn absolute right-2 top-2 h-7 w-7 p-0 text-sm"
        aria-label="Copy to clipboard"
      >
        {copied ? "✓" : "📋"}
      </button>
      {status && (
        <span
          className={`absolute bottom-0 right-0 rounded-tl-[10px] px-3 py-1 text-xs font-bold ${
            status === "valid" ? "bg-nb-green text-nb-ink" : "bg-nb-pink text-white"
          }`}
        >
          {status === "valid" ? "Valid" : "Invalid"}
        </span>
      )}
    </div>
  );
}
