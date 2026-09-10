"use client";

import { useSyncExternalStore } from "react";

// Mirrors Tailwind's default `md` breakpoint (768px) — below this the app
// switches to single-day-calendar / no-drag-board / drawer-sidebar layouts.
// Desktop (>= 768px) behavior is untouched by any of these mobile branches.
const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

// Server (and the initial client render, pre-hydration) always reports
// desktop — avoids a hydration mismatch, then flips right after mount if
// the viewport is actually narrow.
function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
