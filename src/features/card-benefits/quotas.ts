export function capBenefit(raw: number, perTransaction: number | null, remainingMonthly: number | null): number {
  for (const amount of [raw, perTransaction, remainingMonthly]) {
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) throw new RangeError("Expected a nonnegative safe integer cap/amount");
  }
  return Math.min(raw, perTransaction ?? raw, remainingMonthly ?? raw);
}
