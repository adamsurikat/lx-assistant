"use client";

import { Temporal } from "temporal-polyfill";
import { TextField } from "./fields/TextField";
import { SelectField } from "./fields/SelectField";
import { useLocalStorageState } from "./useLocalStorageState";

const PRECISIONS = ["second", "millisecond", "microsecond", "nanosecond"] as const;
type Precision = (typeof PRECISIONS)[number];

const PRECISION_LENGTH: Record<Precision, number> = {
  second: 10,
  millisecond: 13,
  microsecond: 16,
  nanosecond: 19,
};

// A handful of common zones pinned to the top of the picker, ahead of the
// full IANA list (via Intl.supportedValuesOf) below.
const QUICK_TIME_ZONES = [
  "Etc/UTC",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const ALL_TIME_ZONES: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

const TIME_ZONES = Array.from(new Set([...QUICK_TIME_ZONES, ...ALL_TIME_ZONES]));

interface EpochState {
  timestamp: string;
  year: string;
  month: string;
  day: string;
  time: string;
  dateTimeString: string;
  timeZone: string;
  precision: Precision;
}

const DEFAULT_TIMESTAMP = "0";
const DEFAULT_TIME_ZONE = "Etc/UTC";
const DEFAULT_DATE_TIME_STRING = new Temporal.Instant(BigInt(0))
  .toZonedDateTimeISO(DEFAULT_TIME_ZONE)
  .round("millisecond")
  .toPlainDateTime()
  .toString();

const DEFAULT_STATE: EpochState = {
  timestamp: DEFAULT_TIMESTAMP,
  year: "1970",
  month: "01",
  day: "01",
  time: "00:00:00",
  dateTimeString: `${DEFAULT_DATE_TIME_STRING}+00:00`,
  timeZone: DEFAULT_TIME_ZONE,
  precision: "millisecond",
};

function zdtToDateTimeString(zdt: Temporal.ZonedDateTime, precision: Precision): string {
  const plain = zdt.round(precision).toPlainDateTime();
  return `${plain}${zdt.offset}`;
}

function zdtToPickerStrings(zdt: Temporal.ZonedDateTime) {
  const { year, month, day, hour, minute, second } = zdt;
  return {
    year: year.toString().padStart(4, "0"),
    month: month.toString().padStart(2, "0"),
    day: day.toString().padStart(2, "0"),
    time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second
      .toString()
      .padStart(2, "0")}`,
  };
}

function timestampToInstant(timestamp: string): Temporal.Instant {
  const nanoseconds = timestamp.padEnd(19, "0").slice(0, 19);
  return new Temporal.Instant(BigInt(nanoseconds));
}

function instantToTimestamp(instant: Temporal.Instant, precision: Precision): string {
  return instant.epochNanoseconds.toString().slice(0, PRECISION_LENGTH[precision]);
}

export function EpochTool() {
  const [state, setState] = useLocalStorageState<EpochState>("tools.epoch", DEFAULT_STATE);
  const { timestamp, year, month, day, time, dateTimeString, timeZone, precision } = state;

  const updateTimestamp = (rawTimestamp: string) => {
    const roundedTimestamp = rawTimestamp.slice(0, PRECISION_LENGTH.nanosecond);
    const nextPrecision =
      PRECISIONS.find((p) => roundedTimestamp.length <= PRECISION_LENGTH[p]) ?? "nanosecond";

    try {
      const instant = timestampToInstant(roundedTimestamp);
      const zdt = instant.toZonedDateTimeISO(timeZone);
      setState({
        ...state,
        precision: nextPrecision,
        timestamp: roundedTimestamp,
        dateTimeString: zdtToDateTimeString(zdt, nextPrecision),
        ...zdtToPickerStrings(zdt),
      });
    } catch (err) {
      console.warn(err);
      setState({ ...state, timestamp: roundedTimestamp });
    }
  };

  const updatePicker = (partial: Partial<Pick<EpochState, "year" | "month" | "day" | "time">>) => {
    try {
      const [hour, minute, second] = (partial.time ?? time).split(":");
      const zdt = Temporal.ZonedDateTime.from({
        timeZone,
        year: Number.parseInt(partial.year ?? year, 10) || 0,
        month: Number.parseInt(partial.month ?? month, 10) || 0,
        day: Number.parseInt(partial.day ?? day, 10) || 0,
        hour: Number.parseInt(hour || "0", 10),
        minute: Number.parseInt(minute || "0", 10),
        second: Number.parseInt(second || "0", 10),
      });
      setState({
        ...state,
        ...partial,
        timestamp: instantToTimestamp(zdt.toInstant(), precision),
        dateTimeString: zdtToDateTimeString(zdt, precision),
      });
    } catch (err) {
      console.warn(err);
      setState({ ...state, ...partial });
    }
  };

  const updateDateTimeString = (dateTimeString: string) => {
    try {
      const instant = Temporal.Instant.from(dateTimeString);
      const zdt = instant.toZonedDateTimeISO(timeZone);
      setState({
        ...state,
        dateTimeString,
        timestamp: instantToTimestamp(instant, precision),
        ...zdtToPickerStrings(zdt),
      });
    } catch (err) {
      console.warn(err);
      setState({ ...state, dateTimeString });
    }
  };

  const updatePrecision = (precision: Precision) => {
    try {
      const roundedTimestamp = timestamp.padEnd(PRECISION_LENGTH[precision], "0").slice(0, PRECISION_LENGTH[precision]);
      const instant = timestampToInstant(roundedTimestamp);
      const zdt = instant.toZonedDateTimeISO(timeZone);
      setState({
        ...state,
        precision,
        timestamp: roundedTimestamp,
        dateTimeString: zdtToDateTimeString(zdt, precision),
        ...zdtToPickerStrings(zdt),
      });
    } catch (err) {
      console.warn(err);
      setState({ ...state, precision });
    }
  };

  const updateTimeZone = (timeZone: string) => {
    try {
      const roundedTimestamp = timestamp.padEnd(PRECISION_LENGTH[precision], "0").slice(0, PRECISION_LENGTH[precision]);
      const instant = timestampToInstant(roundedTimestamp);
      const zdt = instant.toZonedDateTimeISO(timeZone);
      setState({
        ...state,
        timeZone,
        timestamp: roundedTimestamp,
        dateTimeString: zdtToDateTimeString(zdt, precision),
        ...zdtToPickerStrings(zdt),
      });
    } catch (err) {
      console.warn(err);
      setState({ ...state, timeZone });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">Time and date-time conversion</h2>

      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Timestamp</label>
        <TextField value={timestamp} onChange={updateTimestamp} className="w-full" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Date-time picker</label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-nb-ink/60">Year</span>
          <TextField maxLength={4} value={year} onChange={(year) => updatePicker({ year })} />
          <span className="text-sm font-medium text-nb-ink/60">Month</span>
          <TextField maxLength={2} value={month} onChange={(month) => updatePicker({ month })} />
          <span className="text-sm font-medium text-nb-ink/60">Day</span>
          <TextField maxLength={2} value={day} onChange={(day) => updatePicker({ day })} />
          <span className="text-sm font-medium text-nb-ink/60">Time</span>
          <TextField maxLength={8} value={time} onChange={(time) => updatePicker({ time })} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Date-time string</label>
        <TextField value={dateTimeString} onChange={updateDateTimeString} className="w-full" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-nb-ink">Precision</span>
          <SelectField value={precision} options={PRECISIONS} onChange={updatePrecision} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-nb-ink">Timezone</span>
          <SelectField value={timeZone} options={TIME_ZONES} onChange={updateTimeZone} />
        </div>
      </div>
    </div>
  );
}
