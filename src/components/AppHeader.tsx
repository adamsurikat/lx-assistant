"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import type { ReactNode } from "react";

interface AppHeaderProps {
  active: "calendar" | "tools" | "settings";
  extra?: ReactNode;
}

const NAV_LINK_CLASS = "rounded-md px-3 py-2 -my-2 -mx-1 transition-colors";
const NAV_LINK_ACTIVE = `${NAV_LINK_CLASS} text-nb-ink underline decoration-nb-ink decoration-2 underline-offset-4`;
const NAV_LINK_INACTIVE = `${NAV_LINK_CLASS} text-nb-ink/60 hover:bg-white/40 hover:text-nb-ink`;

export function AppHeader({ active, extra }: AppHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="nb-panel-sm sticky top-0 z-20 m-3 mb-0 flex items-center justify-between bg-nb-orange px-8 py-4">
      <div className="flex items-center gap-8">
        <h1 className="nb-display text-2xl">🗓️ lx-assistant</h1>
        <nav className="flex items-center gap-2 text-lg font-bold">
          <Link href="/" className={active === "calendar" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Calendar
          </Link>
          <Link href="/tools" className={active === "tools" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}>
            Tools
          </Link>
          <Link
            href="/settings"
            className={active === "settings" ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}
          >
            Settings
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-5 text-lg font-bold">
        {extra}
        <span>{session?.user?.name}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={`${NAV_LINK_CLASS} text-nb-ink/60 hover:bg-white/40 hover:text-nb-ink`}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
