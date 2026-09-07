"use client";

import { useState } from "react";

/**
 * Like useState, but persists the value to localStorage under `key` so each
 * tool remembers what you last typed into it across page reloads. Reads are
 * guarded for SSR (localStorage isn't available on the server).
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const update = (next: T) => {
    setValue(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore quota/serialization errors — the in-memory state still updates.
      }
    }
  };

  return [value, update] as const;
}
