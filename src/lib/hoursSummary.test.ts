import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHoursSummary } from "./hoursSummary";

function entry(start: string, end: string) {
  return { start: new Date(start), end: new Date(end) };
}

const completed2024 = new Date(2025, 0, 1);
const zeroTotals = { workedHours: 0, expectedHours: 0, diffHours: 0 };

test("annual totals combine worked days across all twelve months and exclude other years", () => {
  const summary = buildHoursSummary({
    year: 2024,
    now: completed2024,
    entries: [
      entry("2023-12-29T08:00:00", "2023-12-29T18:00:00"),
      entry("2024-01-08T08:00:00", "2024-01-08T12:00:00"),
      entry("2024-01-08T13:00:00", "2024-01-08T18:00:00"),
      entry("2024-06-03T08:00:00", "2024-06-03T15:30:00"),
      entry("2024-12-30T08:00:00", "2024-12-30T18:00:00"),
      entry("2025-01-02T08:00:00", "2025-01-02T18:00:00"),
    ],
  });

  assert.equal(summary.period, "year");
  assert.equal(summary.year, 2024);
  assert.equal(summary.month, null);
  assert.equal(summary.days.length, 366);
  assert.equal(summary.days[0].date, "2024-01-01");
  assert.equal(summary.days.at(-1)?.date, "2024-12-31");
  assert.deepEqual(
    summary.months.map(({ month }) => month),
    Array.from({ length: 12 }, (_, index) => `2024-${String(index + 1).padStart(2, "0")}`),
  );
  assert.deepEqual(summary.totals, { workedHours: 26.5, expectedHours: 24, diffHours: 2.5 });
  assert.deepEqual(summary.months[0].totals, { workedHours: 9, expectedHours: 8, diffHours: 1 });
  assert.deepEqual(summary.months[5].totals, { workedHours: 7.5, expectedHours: 8, diffHours: -0.5 });
  assert.deepEqual(summary.months[11].totals, { workedHours: 10, expectedHours: 8, diffHours: 2 });
  assert.deepEqual(summary.months[1].totals, zeroTotals);
});

test("empty days are ignored while partial worked weekdays count against eight hours", () => {
  const summary = buildHoursSummary({
    year: 2024,
    now: completed2024,
    entries: [entry("2024-01-08T09:00:00", "2024-01-08T13:00:00")],
  });

  assert.deepEqual(summary.totals, { workedHours: 4, expectedHours: 8, diffHours: -4 });
  assert.deepEqual(summary.days.find(({ date }) => date === "2024-01-08"), {
    date: "2024-01-08",
    weekday: 1,
    workedHours: 4,
    expectedHours: 8,
    diffHours: -4,
  });
  assert.deepEqual(summary.days.find(({ date }) => date === "2024-01-09"), {
    date: "2024-01-09",
    weekday: 2,
    workedHours: 0,
    expectedHours: 0,
    diffHours: null,
  });
});

test("a year with no work has zero totals and no daily differences", () => {
  const summary = buildHoursSummary({ year: 2024, entries: [], now: completed2024 });

  assert.deepEqual(summary.totals, zeroTotals);
  assert.ok(summary.days.every((day) => day.expectedHours === 0 && day.diffHours === null));
  assert.equal(summary.months.length, 12);
  for (const month of summary.months) assert.deepEqual(month.totals, zeroTotals);
});

test("a future year has no accumulated baseline or worked total", () => {
  const summary = buildHoursSummary({
    year: 2024,
    now: new Date(2023, 11, 31),
    entries: [entry("2024-01-01T08:00:00", "2024-01-01T16:00:00")],
  });

  assert.deepEqual(summary.totals, zeroTotals);
  assert.equal(summary.days[0].workedHours, 8);
  assert.ok(summary.days.every((day) => day.expectedHours === 0 && day.diffHours === null));
  for (const month of summary.months) assert.deepEqual(month.totals, zeroTotals);
});

test("monthly summaries agree with each corresponding annual breakdown", () => {
  const entries = [
    entry("2024-01-31T23:00:00", "2024-02-01T02:00:00"),
    entry("2024-02-29T08:00:00", "2024-02-29T17:30:00"),
    entry("2024-07-15T08:00:00", "2024-07-15T16:00:00"),
  ];

  const annual = buildHoursSummary({ year: 2024, entries, now: completed2024 });
  for (let month = 1; month <= 12; month++) {
    const monthly = buildHoursSummary({ year: 2024, month, entries, now: completed2024 });
    const breakdown = annual.months[month - 1];
    assert.equal(monthly.period, "month");
    assert.equal(monthly.month, breakdown.month);
    assert.deepEqual(monthly.totals, breakdown.totals);
    assert.deepEqual(monthly.months, [breakdown]);
    assert.deepEqual(monthly.days, annual.days.filter(({ date }) => date.startsWith(breakdown.month)));
  }
  assert.deepEqual(
    annual.months.reduce((total, { totals }) => ({
      workedHours: total.workedHours + totals.workedHours,
      expectedHours: total.expectedHours + totals.expectedHours,
      diffHours: total.diffHours + totals.diffHours,
    }), { ...zeroTotals }),
    annual.totals,
  );
});

test("leap day is included as a normal worked weekday", () => {
  const summary = buildHoursSummary({
    year: 2024,
    month: 2,
    now: completed2024,
    entries: [entry("2024-02-29T08:00:00", "2024-02-29T17:30:00")],
  });

  assert.equal(summary.days.length, 29);
  assert.equal(summary.days.at(-1)?.date, "2024-02-29");
  assert.equal(summary.days.at(-1)?.diffHours, 1.5);
  assert.deepEqual(summary.totals, { workedHours: 9.5, expectedHours: 8, diffHours: 1.5 });
});

test("today and future work stay visible but do not affect completed-day totals", () => {
  const summary = buildHoursSummary({
    year: 2024,
    month: 6,
    now: new Date(2024, 5, 5, 12),
    entries: [
      entry("2024-06-03T08:00:00", "2024-06-03T17:00:00"),
      entry("2024-06-04T08:00:00", "2024-06-04T15:00:00"),
      entry("2024-06-05T06:00:00", "2024-06-05T12:00:00"),
      entry("2024-06-06T08:00:00", "2024-06-06T18:00:00"),
    ],
  });

  assert.deepEqual(summary.totals, { workedHours: 16, expectedHours: 16, diffHours: 0 });
  for (const [date, workedHours] of [["2024-06-05", 6], ["2024-06-06", 10]] as const) {
    const day = summary.days.find((day) => day.date === date);
    assert.equal(day?.workedHours, workedHours);
    assert.equal(day?.expectedHours, 0);
    assert.equal(day?.diffHours, null);
  }
  assert.ok(summary.days.filter(({ date }) => date >= "2024-06-05").every((day) => day.diffHours === null));
});

test("completed weekend work contributes to worked hours but not the weekday difference", () => {
  const summary = buildHoursSummary({
    year: 2024,
    now: completed2024,
    entries: [
      entry("2024-01-06T08:00:00", "2024-01-06T12:00:00"),
      entry("2024-01-07T09:00:00", "2024-01-07T12:00:00"),
      entry("2024-01-08T08:00:00", "2024-01-08T17:00:00"),
    ],
  });

  assert.deepEqual(summary.totals, { workedHours: 16, expectedHours: 8, diffHours: 1 });
  for (const date of ["2024-01-06", "2024-01-07"]) {
    const day = summary.days.find((day) => day.date === date);
    assert.equal(day?.expectedHours, 0);
    assert.equal(day?.diffHours, null);
  }
});

test("overnight entries are split into calendar days and clipped to the selected year", () => {
  const summary = buildHoursSummary({
    year: 2024,
    now: completed2024,
    entries: [
      entry("2023-12-31T22:00:00", "2024-01-01T02:00:00"),
      entry("2024-01-08T22:00:00", "2024-01-09T02:00:00"),
      entry("2024-12-31T22:00:00", "2025-01-01T02:00:00"),
    ],
  });

  assert.deepEqual(summary.totals, { workedHours: 8, expectedHours: 32, diffHours: -24 });
  for (const date of ["2024-01-01", "2024-01-08", "2024-01-09", "2024-12-31"]) {
    const day = summary.days.find((day) => day.date === date);
    assert.equal(day?.workedHours, 2);
    assert.equal(day?.diffHours, -6);
  }
});

test("calendar-day splitting handles a daylight-saving transition and month boundary", () => {
  // This interval includes the spring DST change in Europe/Stockholm.
  // Use local dates so the same test also remains valid in UTC and other zones.
  const work = entry("2024-03-30T23:00:00", "2024-04-01T01:00:00");
  const march31Hours = (new Date(2024, 3, 1).getTime() - new Date(2024, 2, 31).getTime()) / 3_600_000;
  const summary = buildHoursSummary({ year: 2024, now: completed2024, entries: [work] });

  assert.equal(summary.days.find(({ date }) => date === "2024-03-30")?.workedHours, 1);
  assert.equal(summary.days.find(({ date }) => date === "2024-03-31")?.workedHours, march31Hours);
  assert.equal(summary.days.find(({ date }) => date === "2024-04-01")?.workedHours, 1);
  assert.deepEqual(summary.totals, {
    workedHours: (work.end.getTime() - work.start.getTime()) / 3_600_000,
    expectedHours: 8,
    diffHours: -7,
  });
  const march = buildHoursSummary({ year: 2024, month: 3, now: completed2024, entries: [work] });
  assert.deepEqual(march.totals, { workedHours: 1 + march31Hours, expectedHours: 0, diffHours: 0 });
});
