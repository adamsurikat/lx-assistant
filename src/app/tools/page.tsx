"use client";

import Link from "next/link";
import { ToolsApp } from "@/components/tools/ToolsApp";

export default function ToolsPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link
        href="/"
        className="mb-4 inline-block text-sm font-bold text-nb-ink underline decoration-nb-orange decoration-2"
      >
        ← Back to calendar
      </Link>
      <h1 className="nb-display mb-1 text-2xl">🛠️ Tools</h1>
      <p className="mb-6 text-sm font-medium text-nb-ink/70">
        Small developer utilities — JWT, Base64, URI encoding, whitespace removal, JSON, time
        conversion, and barcode generation.
      </p>

      <ToolsApp />
    </main>
  );
}
