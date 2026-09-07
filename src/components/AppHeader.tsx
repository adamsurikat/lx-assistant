"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import type { ReactNode } from "react";

interface AppHeaderProps {
  active: "calendar" | "tools";
  extra?: ReactNode;
}

export function AppHeader({ active, extra }: AppHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="nb-panel-sm sticky top-0 z-20 m-3 mb-0 flex items-center justify-between bg-nb-orange px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="nb-display text-lg">🗓️ lx-assistant</h1>
        <nav className="flex items-center gap-2 text-sm font-bold">
          <Link
            href="/"
            className={`nb-btn px-3 py-1 text-xs ${
              active === "calendar" ? "nb-btn-green" : "bg-white"
            }`}
          >
            Calendar
          </Link>
          <Link
            href="/tools"
            className={`nb-btn px-3 py-1 text-xs ${
              active === "tools" ? "nb-btn-green" : "bg-white"
            }`}
          >
            Tools
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4 text-sm font-bold">
        {extra}
        <span>{session?.user?.name}</span>
        <Link href="/settings" className="underline decoration-2">
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="underline decoration-2"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
