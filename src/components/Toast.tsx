"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timeoutId = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="nb-panel-sm fixed bottom-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 items-start gap-4 border border-black/10 bg-gray-200 px-4 py-3 text-sm font-bold text-black shadow-lg"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 text-lg leading-none text-black/60 hover:text-black"
      >
        ×
      </button>
    </div>
  );
}
