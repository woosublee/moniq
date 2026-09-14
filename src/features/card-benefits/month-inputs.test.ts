import { describe, expect, it } from "vitest";
import { monthInputSchema, resolvePerformanceData } from "./month-inputs";

const required = { verification: "verified", performance: { kind: "previous_month", scopeKey: "spend" } } as const;

describe("performance data state", () => {
  it("does not confuse unverified rules with explicit no-requirement", () => {
    expect(resolvePerformanceData({ verification: "unverified", performance: { kind: "none" } }, null, null)).toEqual({ status: "unverified" });
    expect(resolvePerformanceData({ verification: "verified", performance: { kind: "none" } }, null, null)).toEqual({ status: "no_requirement" });
  });
  it("keeps missing, incomplete and pre-tracking data unknown rather than zero", () => {
    expect(resolvePerformanceData(required, null, 0)).toEqual({ status: "missing", reason: "not_entered" });
    expect(resolvePerformanceData(required, { status: "incomplete" }, 1000)).toEqual({ status: "missing", reason: "incomplete" });
    expect(resolvePerformanceData(required, { status: "before_tracking_unknown" }, 0)).toEqual({ status: "missing", reason: "before_tracking" });
  });
  it("manual total replaces only its selected scope, including confirmed zero", () => {
    expect(resolvePerformanceData(required, { status: "manual_total", amount: 0 }, 50000)).toEqual({ status: "known", source: "manual_total", total: 0 });
    expect(resolvePerformanceData(required, { status: "manual_total", amount: 100000 }, 50000)).toEqual({ status: "known", source: "manual_total", total: 100000 });
  });
  it("requires a supplied ledger total for complete inputs and preserves decimal text", () => {
    expect(resolvePerformanceData(required, { status: "complete" }, null)).toEqual({ status: "missing", reason: "ledger_unavailable" });
    expect(resolvePerformanceData(required, { status: "complete" }, "1234.56")).toEqual({ status: "known", source: "ledger", total: "1234.56" });
    expect(resolvePerformanceData(required, { status: "complete" }, 0)).toEqual({ status: "known", source: "ledger", total: 0 });
  });
});

describe("month input payloads", () => {
  const input = { month: "2026-09", scopeInstanceKey: "card-a:spend", scopeKind: "performance", scopeKey: "spend", data: { status: "manual_total", amount: 0 } };
  it("validates performance and quota completeness independently", () => {
    expect(monthInputSchema.parse(input).data).toEqual({ status: "manual_total", amount: 0 });
    expect(monthInputSchema.parse({ ...input, scopeKind: "quota", scopeKey: "cafe", data: { status: "unknown" } }).data).toEqual({ status: "unknown" });
    expect(monthInputSchema.parse({ ...input, scopeKind: "quota", data: { status: "remaining", amount: 0 } }).data).toEqual({ status: "remaining", amount: 0 });
  });
  it.each([
    { ...input, month: "2026-13" },
    { ...input, data: { status: "manual_total", amount: 0.5 } },
    { ...input, data: { status: "complete", amount: 0 } },
    { ...input, scopeKind: "quota" },
    { ...input, data: { status: "remaining", amount: 0 } },
    { ...input, version: "unknown-field" },
  ])("rejects malformed or contradictory month inputs", (value) => {
    expect(monthInputSchema.safeParse(value).success).toBe(false);
  });
});
