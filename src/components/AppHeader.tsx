"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { POSTITS_CHANGED_EVENT } from "@/lib/postits";

interface AppHeaderProps {
  active: "calendar" | "tools" | "links" | "board" | "map" | "settings";
  extra?: ReactNode;
}

const NAV_LINK_CLASS =
  "rounded-lg px-2.5 py-2 -my-2 -mx-1 transition-colors md:px-4 md:py-3 md:-my-3";
const NAV_LINK_ACTIVE = `${NAV_LINK_CLASS} hover:bg-nb-orange/10 text-nb-ink underline decoration-nb-ink decoration-2 underline-offset-4`;
const NAV_LINK_INACTIVE = `${NAV_LINK_CLASS} text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink`;

// Icon-only variants of the nav link styling above, used for Settings/Sign
// out on the far right so they don't need to reserve space for a label.
const ICON_BUTTON_CLASS = "rounded-lg p-2 transition-colors md:p-2.5";
const ICON_BUTTON_ACTIVE = `${ICON_BUTTON_CLASS} hover:bg-nb-orange/10 text-nb-ink`;
const ICON_BUTTON_INACTIVE = `${ICON_BUTTON_CLASS} text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink`;

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 md:h-6 md:w-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.296-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

// The app's brand mark — a time-clock punch card, matching src/app/icon.tsx
// (the favicon) so the app bar and browser tab use the same motif.
function BrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect
        x={2.24}
        y={2.24}
        width={27.52}
        height={27.52}
        rx={6.02}
        fill="#fdf6ec"
        stroke="#111111"
        strokeWidth={1.72}
      />
      <rect x={9.98} y={6.11} width={12.04} height={3.1} rx={1.55} fill="#111111" />
      <rect x={9.55} y={13.42} width={2.92} height={2.92} rx={0.77} fill="#111111" />
      <rect x={14.54} y={13.42} width={2.92} height={2.92} rx={0.77} fill="#111111" />
      <rect x={19.53} y={13.42} width={2.92} height={2.92} rx={0.77} fill="#111111" />
      <rect x={9.55} y={19.44} width={2.92} height={2.92} rx={0.77} fill="#ff5f1f" />
      <rect x={14.54} y={19.44} width={2.92} height={2.92} rx={0.77} fill="#ff5f1f" />
      <rect x={19.53} y={19.44} width={2.92} height={2.92} rx={0.77} fill="#ff5f1f" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 md:h-6 md:w-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H3"
      />
    </svg>
  );
}

// Cache the last known post-it count in sessionStorage so the nav badge can
// render immediately on mount with the previous value instead of flashing
// away and back while a fresh count is fetched — AppHeader remounts on every
// page navigation since it isn't part of a shared layout.
const POSTIT_COUNT_CACHE_KEY = "lx-assistant:postit-count";
// Dispatched right after a fresh count is written to sessionStorage, so
// every mounted AppHeader's useSyncExternalStore snapshot (read via
// getPostItCountSnapshot below) is told to re-read it and re-render.
const POSTIT_COUNT_UPDATED_EVENT = "lx-assistant:postit-count-updated";

// The app bar title rotates daily through these options — same title for
// everyone on a given calendar day (based on day-of-year), then wraps
// around once it's cycled through all of them.
const APP_TITLES = [
  "lx-assistent",
  "lx-träl",
  "lx-piga",
  "lx-dräng",
  "lx-sekreterare",
  "lx-betjänt",
  "lx-passopp",
  "lx-väpnare",
  "lx-tjänare",
  "lx-prao",
  "lx-rådgivare",
  "lx-kammarjungfru",
];
function titleForToday(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
  return APP_TITLES[dayOfYear % APP_TITLES.length];
}
// The server always renders the same fixed title (it has no reliable notion
// of "the client's today"), and the client swaps in the real day-based
// title once mounted — mirrors the postit-count snapshot pattern above, so
// hydration always matches without a mismatch warning.
function getAppTitleServerSnapshot(): string {
  return APP_TITLES[0];
}
function subscribeToAppTitle(): () => void {
  return () => {};
}

function readCachedPostItCount(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(POSTIT_COUNT_CACHE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function subscribeToPostItCount(callback: () => void) {
  window.addEventListener(POSTIT_COUNT_UPDATED_EVENT, callback);
  return () => window.removeEventListener(POSTIT_COUNT_UPDATED_EVENT, callback);
}

// The server has no access to sessionStorage, so it always "sees" no
// count — matching that here (rather than reading the cache during the
// very first client render, which runs before hydration completes) avoids
// a hydration mismatch. The real cached value, if any, becomes visible a
// moment later once the effect below fires and dispatches
// POSTIT_COUNT_UPDATED_EVENT for the first time.
function getPostItCountServerSnapshot(): number | null {
  return null;
}

export function AppHeader({ active, extra }: AppHeaderProps) {
  const { data: session } = useSession();
  const appTitle = useSyncExternalStore(subscribeToAppTitle, titleForToday, getAppTitleServerSnapshot);
  const postItCount = useSyncExternalStore(
    subscribeToPostItCount,
    readCachedPostItCount,
    getPostItCountServerSnapshot
  );

  useEffect(() => {
    let cancelled = false;
    const loadCount = () => {
      fetch("/api/postits/count")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { count: number } | null) => {
          if (cancelled || !data) return;
          window.sessionStorage.setItem(POSTIT_COUNT_CACHE_KEY, String(data.count));
          window.dispatchEvent(new Event(POSTIT_COUNT_UPDATED_EVENT));
        })
        .catch(() => {});
    };

    loadCount();
    // Keep the badge in sync while the user adds/removes notes on the board
    // page itself, and when they come back to the tab from elsewhere.
    window.addEventListener(POSTITS_CHANGED_EVENT, loadCount);
    window.addEventListener("focus", loadCount);
    return () => {
      cancelled = true;
      window.removeEventListener(POSTITS_CHANGED_EVENT, loadCount);
      window.removeEventListener("focus", loadCount);
    };
  }, []);

  return (
    <header className="nb-panel-sm sticky top-0 z-20 m-3 mb-0 flex flex-col gap-2 bg-nb-orange px-4 py-3 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-8 md:py-4">
      <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-start md:gap-8">
        <h1 className="nb-display flex items-center gap-2 text-lg md:text-2xl">
          <BrandIcon className="h-6 w-6 shrink-0 md:h-8 md:w-8" />
          {appTitle}
        </h1>
        {/* Settings/logout (and any `extra` action) pinned to the top-right
            corner on mobile, alongside the title, instead of wrapping onto
            their own row below the nav links. Hidden at md: and up, where
            the equivalent desktop-only block further down (unchanged from
            before) already renders them at the far right of the header. */}
        <div className="flex items-center gap-1 md:hidden">
          {extra}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={active === "settings" ? ICON_BUTTON_ACTIVE : ICON_BUTTON_INACTIVE}
          >
            <CogIcon />
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Sign out"
            title="Sign out"
            className={`${ICON_BUTTON_CLASS} cursor-pointer text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink`}
          >
            <LogoutIcon />
          </button>
        </div>
        <nav className="hidden items-center gap-3 text-lg font-bold md:flex">
          <Link href="/" className={active === "calendar" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Calendar
          </Link>
          <Link href="/tools" className={active === "tools" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Tools
          </Link>
          <Link href="/links" className={active === "links" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Links
          </Link>
          <Link
            href="/board"
            className={active === "board" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}
          >
            <span className="relative">
              Board
              {!!postItCount && (
                <span className="nb-badge-count absolute -right-[17px] -top-[11px] flex h-5 min-w-5 items-center justify-center rounded-full bg-nb-pink px-1 text-xs font-bold leading-none text-white">
                  {postItCount > 99 ? "99+" : postItCount}
                </span>
              )}
            </span>
          </Link>
          <Link href="/map" className={active === "map" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Map
          </Link>
        </nav>
      </div>
      {/* Mobile-only nav row, wrapping full-width below the title/icons
          row above. Desktop uses the `md:flex` nav rendered inline next to
          the title instead (identical links, kept as a separate block so
          the icons can sit beside the title only on mobile without
          disturbing the unchanged desktop layout). */}
      <nav className="flex flex-wrap items-center gap-2 text-sm font-bold md:hidden">
        <Link href="/" className={active === "calendar" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
          Calendar
        </Link>
        <Link href="/tools" className={active === "tools" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
          Tools
        </Link>
        <Link href="/links" className={active === "links" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
          Links
        </Link>
        <Link
          href="/board"
          className={active === "board" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}
        >
          <span className="relative">
            Board
            {!!postItCount && (
              <span className="nb-badge-count absolute -right-[17px] -top-[11px] flex h-5 min-w-5 items-center justify-center rounded-full bg-nb-pink px-1 text-xs font-bold leading-none text-white">
                {postItCount > 99 ? "99+" : postItCount}
              </span>
            )}
          </span>
        </Link>
        <Link href="/map" className={active === "map" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
          Map
        </Link>
      </nav>
      <div className="hidden items-center gap-3 text-lg font-bold md:flex">
        {extra}
        <span>{session?.user?.name}</span>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className={active === "settings" ? ICON_BUTTON_ACTIVE : ICON_BUTTON_INACTIVE}
        >
          <CogIcon />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          title="Sign out"
          className={`${ICON_BUTTON_CLASS} cursor-pointer text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink`}
        >
          <LogoutIcon />
        </button>
      </div>
    </header>
  );
}
