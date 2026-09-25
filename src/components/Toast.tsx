"use client";

import { useCallback, useEffect, useState } from "react";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  const [exitingMessage, setExitingMessage] = useState<string | null>(null);
  const isExiting = message !== null && exitingMessage === message;

  const startExit = useCallback(() => {
    if (message) setExitingMessage(message);
  }, [message]);

  useEffect(() => {
    if (!message) return;
    const timeoutId = window.setTimeout(startExit, 7700);
    return () => window.clearTimeout(timeoutId);
  }, [message, startExit]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`site-toast nb-panel-sm fixed bottom-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-lg items-start gap-4 border border-black/10 px-4 py-3 text-sm font-bold text-nb-pink shadow-lg ${
        isExiting ? "site-toast--exit" : "site-toast--enter"
      }`}
      style={{ backgroundColor: "#e5e7eb" }}
      onAnimationEnd={(event) => {
        if (event.animationName === "site-toast-pan-out") {
          setExitingMessage(null);
          onDismiss();
        }
      }}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={startExit}
        aria-label="Dismiss notification"
        className="shrink-0 text-lg leading-none text-nb-pink/80 hover:text-nb-pink"
      >
        ×
      </button>
    </div>
  );
}
