import type { SpendPeriod } from "@/features/card-benefits/types";

const toDateInputValue = (date: Date) => {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getLocalDate = (date: Date, timezoneOffset = "0") => {
  const offsetMinutes = Number(timezoneOffset);
  const normalizedOffset = Number.isFinite(offsetMinutes) ? offsetMinutes : 0;

  return new Date(date.getTime() - normalizedOffset * 60_000);
};

export const toPeriodKey = ({ startDate }: Pick<SpendPeriod, "startDate">) => startDate.slice(0, 7);

export const getSpendPeriodForDate = (
  date: Date,
  timezoneOffset = "0",
): SpendPeriod => {
  const localDate = getLocalDate(date, timezoneOffset);
  const year = localDate.getUTCFullYear();
  const month = localDate.getUTCMonth();
  const startDate = toDateInputValue(new Date(Date.UTC(year, month, 1)));
  const endDate = toDateInputValue(new Date(Date.UTC(year, month + 1, 0)));

  return {
    key: startDate.slice(0, 7),
    startDate,
    endDate,
  };
};

export const getCurrentSpendPeriod = (timezoneOffset = "0") =>
  getSpendPeriodForDate(new Date(), timezoneOffset);

export type MonthKey = `${number}-${number}`;
export type MonthBounds = { startInclusive: string; endExclusive: string };

/** PostgreSQL instants retain up to six fractional digits. Date is only used for
 * Gregorian/calendar validation; ordering uses exact epoch microseconds. */
export function parseSeoulInstant(value: string): { day: string; month: MonthKey; time: bigint } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T([0-2]\d):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !parseMonth(match[1].slice(0, 7)) || Number(match[2]) > 23) return null;
  const zone = match[6];
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null;
  const local = new Date(`${match[1]}T00:00:00Z`);
  const seconds = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}${zone}`);
  if (!Number.isFinite(seconds) || !Number.isFinite(local.getTime()) || local.toISOString().slice(0, 10) !== match[1]) return null;
  const day = new Date(seconds + 9 * 3600000).toISOString().slice(0, 10);
  const month = parseMonth(day.slice(0, 7));
  return month ? { day, month, time: BigInt(seconds) * BigInt(1000) + BigInt((match[5] ?? "").padEnd(6, "0")) } : null;
}

export function readStableSequence(value: number | string | undefined): bigint | null {
  if (value === undefined || typeof value === "number" && (!Number.isSafeInteger(value) || value < 0) || !/^\d+$/.test(String(value))) return null;
  return BigInt(value);
}

type ChronologicalEntry = { occurred_at: string; stable_sequence?: number | string; id: string };
/** Ascending exact chronology; sequence breaks only exact timestamp ties. */
export function compareLedgerChronology(a: ChronologicalEntry, b: ChronologicalEntry): number {
  const left = parseSeoulInstant(a.occurred_at)?.time ?? null;
  const right = parseSeoulInstant(b.occurred_at)?.time ?? null;
  if (left !== right) return left === null ? 1 : right === null ? -1 : left < right ? -1 : 1;
  const leftSequence = readStableSequence(a.stable_sequence);
  const rightSequence = readStableSequence(b.stable_sequence);
  return (leftSequence !== null && rightSequence !== null ? leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0 : 0) || a.id.localeCompare(b.id);
}

/** Canonical Gregorian months, years 0001..9999; no clock or host timezone. */
export const parseMonth = (value: string): MonthKey | null =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value as MonthKey : null;

export const shiftMonth = (month: MonthKey, offset: number): MonthKey => {
  if (!parseMonth(month) || !Number.isSafeInteger(offset)) throw new RangeError("Invalid month or offset");
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  if (index < 12 || index >= 120000) throw new RangeError("Month outside supported years");
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}` as MonthKey;
};

/** SQL consumers must use >= startInclusive AND < endExclusive. */
export const getMonthBounds = (month: MonthKey): MonthBounds => {
  if (!parseMonth(month)) throw new RangeError("Invalid month");
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const seoulOffset = 9 * 60 * 60 * 1000;
  return {
    startInclusive: new Date(start.getTime() - seoulOffset).toISOString(),
    endExclusive: new Date(end.getTime() - seoulOffset).toISOString(),
  };
};

export const getPreviousSpendPeriod = (selectedMonth: MonthKey): SpendPeriod => {
  const key = shiftMonth(selectedMonth, -1);
  const end = new Date(`${selectedMonth}-01T00:00:00.000Z`);
  end.setUTCDate(0);
  return { key, startDate: `${key}-01`, endDate: toDateInputValue(end) };
};
