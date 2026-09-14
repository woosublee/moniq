import { describe, expect, it } from "vitest";
import { getMonthBounds, getPreviousSpendPeriod, parseMonth, shiftMonth } from "./periods";

describe("selected Seoul calendar months", () => {
  it.each(["2026-00", "2026-13", "2026-9", " 2026-09", "0000-01", "2026-09-01", "10000-01"])("rejects noncanonical month %s", (value) => {
    expect(parseMonth(value)).toBeNull();
  });
  it("accepts canonical months without a clock", () => {
    expect(parseMonth("2026-09")).toBe("2026-09");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2024-02", 12)).toBe("2025-02");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(getPreviousSpendPeriod("2024-03")).toEqual({ key: "2024-02", startDate: "2024-02-01", endDate: "2024-02-29" });
  });
  it("preserves four-digit early years in the legacy period adapter", () => {
    expect(getPreviousSpendPeriod("0001-02")).toEqual({ key: "0001-01", startDate: "0001-01-01", endDate: "0001-01-31" });
    expect(getMonthBounds("9999-12")).toEqual({ startInclusive: "9999-11-30T15:00:00.000Z", endExclusive: "9999-12-31T15:00:00.000Z" });
  });
  it("rejects invalid offsets and out-of-range arithmetic", () => {
    expect(() => shiftMonth("2026-09", 0.5)).toThrow(RangeError);
    expect(() => shiftMonth("2026-13", 0)).toThrow(RangeError);
    expect(() => shiftMonth("0001-01", -1)).toThrow(RangeError);
    expect(() => shiftMonth("9999-12", 1)).toThrow(RangeError);
  });
  it.each([
    ["2026-09", "2026-08-31T15:00:00.000Z", "2026-09-30T15:00:00.000Z"],
    ["2024-02", "2024-01-31T15:00:00.000Z", "2024-02-29T15:00:00.000Z"],
    ["2025-12", "2025-11-30T15:00:00.000Z", "2025-12-31T15:00:00.000Z"],
  ] as const)("bounds %s include the final millisecond but exclude next midnight", (month, start, end) => {
    const bounds = getMonthBounds(month);
    expect(bounds).toEqual({ startInclusive: start, endExclusive: end });
    expect(new Date(Date.parse(bounds.endExclusive) - 1).toISOString()).toBe(end.replace("15:00:00.000", "14:59:59.999"));
  });
});
