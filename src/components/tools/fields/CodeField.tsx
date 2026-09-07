"use client";

import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { CopyPasteButtons } from "./CopyPasteButtons";

interface CodeFieldProps {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  status?: "valid" | "invalid";
  height?: string;
}

/**
 * A code-style textarea (CodeMirror) used across the developer tools page,
 * with copy/paste buttons and an optional valid/invalid badge.
 */
export function CodeField({ value, onChange, disabled, status, height = "190px" }: CodeFieldProps) {
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
      <CopyPasteButtons
        value={value}
        onPaste={disabled ? undefined : onChange}
        className="absolute right-2 top-2"
      />
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
