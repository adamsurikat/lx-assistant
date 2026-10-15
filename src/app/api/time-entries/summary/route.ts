import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildHoursSummary, getHoursSummaryRange } from "@/lib/hoursSummary";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");
  if (monthParam !== null && yearParam !== null) {
    return NextResponse.json({ error: "Choose either a month or a year." }, { status: 400 });
  }

  const now = new Date();
  let year = now.getFullYear();
  let month: number | undefined = now.getMonth() + 1;

  if (yearParam !== null) {
    if (!/^\d{4}$/.test(yearParam) || Number(yearParam) < 1) {
      return NextResponse.json({ error: "Year must use YYYY, between 0001 and 9999." }, { status: 400 });
    }
    year = Number(yearParam);
    month = undefined;
  } else if (monthParam !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) || Number(monthParam.slice(0, 4)) < 1) {
      return NextResponse.json({ error: "Month must use YYYY-MM, with a valid year and month." }, { status: 400 });
    }
    year = Number(monthParam.slice(0, 4));
    month = Number(monthParam.slice(5));
  }

  const { rangeStart, rangeEnd } = getHoursSummaryRange(year, month);
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.user.id,
      start: { lt: rangeEnd },
      end: { gt: rangeStart },
    },
    select: { start: true, end: true },
  });

  return NextResponse.json(buildHoursSummary({
    entries,
    year,
    month,
    now,
  }));
}
