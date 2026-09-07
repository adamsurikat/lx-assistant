"use client";

import { AppHeader } from "@/components/AppHeader";
import { ToolsApp } from "@/components/tools/ToolsApp";

export default function ToolsPage() {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="tools" />
      <main className="mx-auto w-full max-w-3xl overflow-y-auto p-8">
        <h1 className="nb-display mb-1 text-2xl">🛠️ Tools</h1>
        <p className="mb-6 text-sm font-medium text-nb-ink/70">
          Small developer utilities — JWT, Base64, URI encoding, whitespace removal, JSON, time
          conversion, and barcode generation.
        </p>

        <ToolsApp />
      </main>
    </div>
  );
}
