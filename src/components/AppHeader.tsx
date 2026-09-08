"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import type { ReactNode } from "react";

interface AppHeaderProps {
  active: "calendar" | "tools" | "settings";
  extra?: ReactNode;
}

const NAV_LINK_CLASS = "rounded-lg px-4 py-3 -my-3 -mx-1 transition-colors";
const NAV_LINK_ACTIVE = `${NAV_LINK_CLASS} hover:bg-nb-orange/10 text-nb-ink underline decoration-nb-ink decoration-2 underline-offset-4`;
const NAV_LINK_INACTIVE = `${NAV_LINK_CLASS} text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink`;

// Icon-only variants of the nav link styling above, used for Settings/Sign
// out on the far right so they don't need to reserve space for a label.
const ICON_BUTTON_CLASS = "rounded-lg p-2.5 transition-colors";
const ICON_BUTTON_ACTIVE = `${ICON_BUTTON_CLASS} hover:bg-nb-orange/10 text-nb-ink`;
const ICON_BUTTON_INACTIVE = `${ICON_BUTTON_CLASS} text-nb-ink/60 hover:bg-nb-orange/10 hover:text-nb-ink`;

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.296-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H3"
      />
    </svg>
  );
}

export function AppHeader({ active, extra }: AppHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="nb-panel-sm sticky top-0 z-20 m-3 mb-0 flex items-center justify-between bg-nb-orange px-8 py-4">
      <div className="flex items-center gap-8">
        <h1 className="nb-display text-2xl">🗓️ lx-assistant</h1>
        <nav className="flex items-center gap-3 text-lg font-bold">
          <Link href="/" className={active === "calendar" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Calendar
          </Link>
          <Link href="/tools" className={active === "tools" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Tools
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3 text-lg font-bold">
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
