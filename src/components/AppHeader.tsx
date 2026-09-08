"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import type { ReactNode } from "react";

interface AppHeaderProps {
  active: "calendar" | "tools" | "settings";
  extra?: ReactNode;
}

export function AppHeader({ active, extra }: AppHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="nb-panel-sm sticky top-0 z-20 m-3 mb-0 flex items-center justify-between bg-nb-orange px-6 py-3">
      <div className="flex items-center gap-6">
        <h1 className="nb-display text-lg">🗓️ lx-assistant</h1>
        <nav className="flex items-center gap-5 text-sm font-bold">
          <Link
            href="/"
            className={
              active === "calendar"
                ? "text-nb-ink underline decoration-nb-ink decoration-2 underline-offset-4"
                : "text-nb-ink/60 hover:text-nb-ink"
            }
          >
            Calendar
          </Link>
          <Link
            href="/tools"
            className={
              active === "tools"
                ? "text-nb-ink underline decoration-nb-ink decoration-2 underline-offset-4"
                : "text-nb-ink/60 hover:text-nb-ink"
            }
          >
            Tools
          </Link>
          <Link
            href="/settings"
            className={
              active === "settings"
                ? "text-nb-ink underline decoration-nb-ink decoration-2 underline-offset-4"
                : "text-nb-ink/60 hover:text-nb-ink"
            }
          >
            Settings
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4 text-sm font-bold">
        {extra}
        <span>{session?.user?.name}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-nb-ink/60 hover:text-nb-ink hover:underline"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
