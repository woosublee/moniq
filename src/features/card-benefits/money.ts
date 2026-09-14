import type { MoneyValue } from "./types";

/** No rounding/coercion of legacy decimals. Integer numeric transport text is exact. */
export function readIntegerAmount(value: MoneyValue | null | undefined): number | null {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function integer(value: number): bigint {
  if (readIntegerAmount(value) === null) throw new RangeError("Expected a nonnegative safe integer");
  return BigInt(value);
}

export function floorRate(amount: number, numerator: number, denominator: number, roundingUnit = 1): number {
  const unit = integer(roundingUnit);
  const divisor = integer(denominator);
  if (unit === BigInt(0) || divisor === BigInt(0)) throw new RangeError("Expected a positive divisor and rounding unit");
  const result = integer(amount) * integer(numerator) / (divisor * unit) * unit;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Amount overflow");
  return Number(result);
}

/** Exact decimal rate bridge for the old API; the replay schema uses integer ratios. */
export function decimalRate(value: MoneyValue | null): { numerator: number; denominator: number } | null {
  const text = String(value);
  if (!/^\d+(\.\d{1,12})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const numerator = readIntegerAmount(whole + fraction);
  return numerator === null ? null : { numerator, denominator: 10 ** fraction.length };
}
