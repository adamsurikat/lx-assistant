import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readBookmarks } from "@/lib/bookmarks";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const root = await readBookmarks();
  return NextResponse.json({ root });
}
