import { expect, it } from "vitest";
import { floorRate, readIntegerAmount } from "./money";
import { capBenefit } from "./quotas";
import { sumAmounts } from "./summaries";

it.each([[19999, 5, 100, 1, 999], [19999, 5, 100, 100, 900], [9007199254740991, 5, 100, 1, 450359962737049]])("floors %i using exact safe multiplication and policy rounding", (amount, numerator, denominator, unit, expected) => {
  expect(floorRate(amount, numerator, denominator, unit)).toBe(expected);
});
it("rejects an unsafe result and zero denominator rather than wrapping or emitting Infinity", () => {
  expect(() => floorRate(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  expect(() => floorRate(1000, 1, 0)).toThrow(RangeError);
});
it("preserves unsupported legacy precision as unknown while accepting integer transport text", () => {
  expect(readIntegerAmount("1000.25")).toBeNull();
  expect(readIntegerAmount("9007199254740992")).toBeNull();
  expect(readIntegerAmount("1000")).toBe(1000);
});
it("marks a scope aggregate above the safe range unknown, not a rounded sum", () => {
  expect(sumAmounts([{ amount: Number.MAX_SAFE_INTEGER, reasons: [] }, { amount: 2, reasons: [] }])).toEqual({ amount: null, reasons: ["precision_unknown"] });
});
it("rejects unsupported precision at the public cap boundary", () => {
  expect(() => capBenefit(100.25, null, null)).toThrow(RangeError);
  expect(() => capBenefit(100, Number.MAX_SAFE_INTEGER + 1, null)).toThrow(RangeError);
});
