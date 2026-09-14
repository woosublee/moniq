import { z } from "zod";
import { parseMonth, type MonthKey } from "./periods";
import { policyKeySchema, wonAmountSchema, type PerformanceBasis } from "./policy-schema";
import type { MoneyValue, RuleVerificationStatus } from "./types";

export const monthKeySchema = z.string().refine((value) => parseMonth(value) !== null, "Invalid calendar month").transform((value) => value as MonthKey);
export const scopeInstanceKeySchema = z.string().min(1).max(160);
export const performanceDataSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("manual_total"), amount: wonAmountSchema }),
  z.strictObject({ status: z.literal("complete") }),
  z.strictObject({ status: z.literal("incomplete") }),
  z.strictObject({ status: z.literal("before_tracking_unknown") }),
]);
export const quotaDataSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("complete") }),
  z.strictObject({ status: z.literal("unknown") }),
  z.strictObject({ status: z.literal("remaining"), amount: wonAmountSchema }),
]);
const scope = { month: monthKeySchema, scopeInstanceKey: scopeInstanceKeySchema, scopeKey: policyKeySchema };
export const monthInputSchema = z.discriminatedUnion("scopeKind", [
  z.strictObject({ ...scope, scopeKind: z.literal("performance"), data: performanceDataSchema }),
  z.strictObject({ ...scope, scopeKind: z.literal("quota"), data: quotaDataSchema }),
]);
export type PerformanceData = z.infer<typeof performanceDataSchema>;
/** Database numeric transport can be decimal text even for new integer inputs. */
export type StoredPerformanceData = Exclude<PerformanceData, { status: "manual_total" }> | { status: "manual_total"; amount: MoneyValue };
export type QuotaData = z.infer<typeof quotaDataSchema>;
export type MonthInput = z.infer<typeof monthInputSchema>;
export type PerformanceDataState =
  | { status: "no_requirement" }
  | { status: "unverified" }
  | { status: "missing"; reason: "not_entered" | "incomplete" | "before_tracking" | "ledger_unavailable" }
  | { status: "known"; source: "manual_total" | "ledger"; total: MoneyValue };

/** Caller selects one exact owner/scope/month. This neither sums nor allocates anything.
 * A manual total replaces that scope only; it says nothing about quota completeness.
 * ledgerTotal must be an exact already-computed value; decimal text passes through untouched.
 */
export const resolvePerformanceData = (
  rule: { verification: RuleVerificationStatus; performance: PerformanceBasis },
  data: StoredPerformanceData | null,
  ledgerTotal: MoneyValue | null,
): PerformanceDataState => {
  if (rule.verification !== "verified") return { status: "unverified" };
  if (rule.performance.kind === "none") return { status: "no_requirement" };
  if (!data) return { status: "missing", reason: "not_entered" };
  switch (data.status) {
    case "manual_total": return { status: "known", source: "manual_total", total: data.amount };
    case "incomplete": return { status: "missing", reason: "incomplete" };
    case "before_tracking_unknown": return { status: "missing", reason: "before_tracking" };
    case "complete": return ledgerTotal === null
      ? { status: "missing", reason: "ledger_unavailable" }
      : { status: "known", source: "ledger", total: ledgerTotal };
  }
};
