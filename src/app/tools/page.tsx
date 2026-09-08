"use client";

import { AppHeader } from "@/components/AppHeader";
import { ToolsApp } from "@/components/tools/ToolsApp";

export default function ToolsPage() {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="tools" />
      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <ToolsApp />
      </div>
    </div>
  );
}
