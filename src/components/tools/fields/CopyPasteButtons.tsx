"use client";

import { useEffect, useState } from "react";

interface CopyPasteButtonsProps {
  value: string;
  onPaste?: (value: string) => void;
  className?: string;
}

/**
 * Small copy/paste icon buttons shared across the developer tools inputs.
 * The paste button is omitted when `onPaste` isn't provided (e.g. read-only
 * output fields, which only make sense to copy from).
 */
export function CopyPasteButtons({ value, onPaste, className = "" }: CopyPasteButtonsProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value ?? "");
          setCopied(true);
        }}
        className="nb-btn h-7 w-7 shrink-0 p-0 text-sm"
        aria-label="Copy to clipboard"
        title="Copy"
      >
        {copied ? "✓" : "📋"}
      </button>
      {onPaste && (
        <button
          type="button"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              onPaste(text);
            } catch {
              // Clipboard read can be denied by the browser; fail silently.
            }
          }}
          className="nb-btn h-7 w-7 shrink-0 p-0 text-sm"
          aria-label="Paste from clipboard"
          title="Paste"
        >
          📥
        </button>
      )}
    </div>
  );
}
