"use client";

import { AppHeader } from "@/components/AppHeader";
import { PostItBoard } from "@/components/board/PostItBoard";

export default function BoardPage() {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="board" />
      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <PostItBoard />
      </div>
    </div>
  );
}
