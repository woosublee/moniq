import { expect, it } from "vitest";
import { replayLedger } from "./replay";
import { annotation, card, inputs, membership, monthData, policy, transaction, version } from "./replay.fixtures";
import type { CardPolicy } from "./policy-schema";
function capped(): CardPolicy {
  const result = policy();
  result.benefits[0] = { ...result.benefits[0], performance: { kind: "none" }, quotaKeys: ["pool"] };
  result.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 1000 } }];
  return result;
}
it("propagates unknown channel consumption to later pool users, not independent benefits", () => {
  const rules = capped(); rules.benefits[0].conditions = [{ kind: "channel", values: ["online"] }];
  const independent = capped(); independent.quotas = []; independent.benefits[0].quotaKeys = [];
  const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", rules), version("b", independent)], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [{ ...transaction("uncertain"), payment_channel: "unknown" }, { ...transaction("later", 10000, "2026-02-03T00:00:00Z", "a", 2), payment_channel: "online" }, transaction("other", 10000, "2026-02-04T00:00:00Z", "b", 3)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([null, null, 500]);
  expect(result.transactions[1].benefits[0].reasons).toContain("quota_unknown");
});
it("a known false AND condition cannot consume an unknown quota", () => {
  const rules = capped(); rules.benefits[0].conditions = [{ kind: "channel", values: ["online"] }, { kind: "minimum_amount", amount: 20000 }];
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], monthInputs: [], transactions: [{ ...transaction("small"), payment_channel: "unknown" }] }), "2026-02");
  expect(result.transactions[0].benefits[0]).toMatchObject({ appliedAmount: 0, status: "not_applicable", reasons: [] });
});
it("cannot confirm a substring merchant suggestion or an unidentified points program", () => {
  const rules = capped(); rules.benefits[0].conditions = [{ kind: "merchant", values: ["Synthetic Shop"] }];
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], merchantRules: [{ id: "shop", keyword: "Shop", normalized_merchant_name: "Synthetic Shop", ledger_category: "retail", priority: 1, is_active: true, created_at: "2026-01-01" }], transactions: [{ ...transaction("ambiguous"), merchant_name: "Mall Shop" }], monthInputs: [monthData("2026-02", "quota", "pool")] }), "2026-02");
  expect(result.transactions[0].benefits[0].reasons).toContain("merchant_ambiguous");
  const points = capped(); points.benefits[0].benefitKind = "points";
  expect(replayLedger(inputs({ ruleVersions: [version("a", points)], transactions: [transaction("points")] }), "2026-02").transactions[0].benefits[0].appliedAmount).toBeNull();
});
it("does not invent a priority when equal timestamps have missing or duplicate stable sequences", () => {
  const snapshot = inputs({ ruleVersions: [version("a", capped())], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("one", 10000, undefined, "a", ""), transaction("two", 10000, undefined, "a", 2)] });
  const result = replayLedger(snapshot, "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([null, null]);
  expect(result.transactions[0].benefits[0].reasons).toContain("ordering_unknown");
  const duplicate = { ...snapshot, transactions: [transaction("one"), transaction("two")] };
  expect(replayLedger(duplicate, "2026-02").transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([null, null]);
});
it("a source with no usable timestamp cannot silently disappear from later quota and performance", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", capped())], monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")], transactions: [transaction("undated", 10000, "2026-02-01"), transaction("dated")] }), "2026-02");
  expect(result.transactions.find((row) => row.id === "dated")?.benefits[0].appliedAmount).toBeNull();
  expect(result.months[1].cards[0].performance[0].amount).toBeNull();
  expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ transactionId: "undated" })]));
});
it("a missing early-month policy leaves later quota consumption unknown even if source rows are complete", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", capped(), { effective_from: "2026-02-15" })], monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")], transactions: [transaction("uncovered"), transaction("covered", 10000, "2026-02-16T00:00:00Z", "a", 2)] }), "2026-02");
  expect(result.transactions[1].benefits[0]).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["incomplete_data"]) });
  expect(result.months[1].cards[0].performance[0].amount).toBeNull();
});
it("keeps performance uncertainty into the next month's gate unless explicitly replaced", () => {
  const rules = capped(); rules.performanceScopes[0].benefitExclusions = ["base"];
  const required = structuredClone(rules); required.benefits[0].performance = { kind: "previous_month", scopeKey: "spend" };
  const snapshot = inputs({ ruleVersions: [version("a", rules), version("a", required, { id: "v2", version_order: 2, effective_from: "2026-03-01" })], transactions: [transaction("feb", 400000), transaction("mar", 10000, "2026-03-02T00:00:00Z", "a", 2)], monthInputs: [monthData("2026-02"), monthData("2026-03"), monthData("2026-03", "quota", "pool")] });
  expect(replayLedger(snapshot, "2026-03").transactions[1].benefits[0].reasons).toContain("missing_performance");
  const fixed = { ...snapshot, monthInputs: [...snapshot.monthInputs.filter((row) => row.month !== "2026-02-01"), monthData("2026-02", "performance", "spend", { status: "manual_total", amount: 400000 })] };
  expect(replayLedger(fixed, "2026-03").transactions[1].benefits[0].appliedAmount).toBe(500);
});
it.each(["before_transaction", "including_transaction", "month_end"] as const)("uses the policy's explicit %s current-month decision point", (timing) => {
  const rules = policy(); rules.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("threshold", 300000), transaction("after", 10000, "2026-02-03T00:00:00Z", "a", 2)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual(timing === "before_transaction" ? [0, 500] : [15000, 500]);
});
it("supports acyclic before-transaction benefit-dependent recognition, not a month-end fixed point", () => {
  const rules = policy(); rules.performanceScopes[0].benefitExclusions = ["base"];
  rules.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing: "before_transaction" };
  const snapshot = inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("threshold", 300000), transaction("after", 10000, "2026-02-03T00:00:00Z", "a", 2)] });
  const result = replayLedger(snapshot, "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([0, 500]);
  expect(result.months[1].cards[0].performance[0].amount).toBe(300000);
  rules.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing: "month_end" };
  const circular = replayLedger({ ...snapshot, ruleVersions: [version("a", rules)] }, "2026-02");
  expect(circular.transactions[0].benefits[0].reasons).toContain("unsupported_condition");
  expect(circular.transactions[0].benefits[0].reasons).toContain("cyclic_performance_dependency");
});
it("does not mislabel an unsupported acyclic dependency or missing data as a policy cycle", () => {
  const rules = policy(); rules.performanceScopes[0].basis = "net_paid";
  rules.benefits[0] = { ...rules.benefits[0], performance: { kind: "none" }, combination: { kind: "stack", with: ["point"], priority: 1 } };
  rules.benefits.push({ ...rules.benefits[0], key: "point", benefitKind: "points", unit: { kind: "points", program: "synthetic" }, performance: { kind: "current_month", scopeKey: "spend", timing: "month_end" }, combination: { kind: "stack", with: ["base"], priority: 2 } });
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")] }), "2026-02");
  expect(result.transactions[0].benefits[0].appliedAmount).toBe(500);
  expect(result.transactions[0].benefits[1].reasons).toContain("unsupported_performance_dependency");
  expect(result.transactions[0].benefits[1].reasons).not.toContain("cyclic_performance_dependency");
  const missing = policy(); missing.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing: "including_transaction" };
  const unknown = replayLedger(inputs({ ruleVersions: [version("a", missing)], transactions: [transaction("one")], monthInputs: [] }), "2026-02");
  expect(unknown.transactions[0].benefits[0].reasons).toEqual(["missing_performance"]);
});
it.each(["including_transaction", "month_end"] as const)("uses scoped source overrides in the independent %s accumulator", (timing) => {
  const rules = policy(); rules.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")], annotations: [annotation("one", 300000, "performance", { target_key: "spend", scope_instance_key: "card:a:performance:spend" })] }), "2026-02");
  expect(result.transactions[0].benefits[0].appliedAmount).toBe(500);
  expect(result.months[1].cards[0].performance[0].amount).toBe(300000);
});
it("does not reuse a final manual monthly total as an opening current-month accumulator", () => {
  const rules = policy(); rules.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing: "before_transaction" };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], monthInputs: [monthData("2026-02", "performance", "spend", { status: "manual_total", amount: 600000 })], transactions: [transaction("first")] }), "2026-02");
  expect(result.transactions[0].benefits[0].appliedAmount).toBeNull();
});
it("keeps missing contributor benefits unknown for net-paid recognition, but verified absent benefits mean no exclusion", () => {
  const target = policy(); target.performanceScopes[0].basis = "net_paid"; target.performanceScopes[0].contributorSlots = ["self", "partner"];
  const snapshot = inputs({ cards: [card(), card("b")], ruleVersions: [version("a", target)], memberships: [membership()], transactions: [transaction("b", 10000, undefined, "b")], monthInputs: [monthData("2026-02")] });
  expect(replayLedger(snapshot, "2026-02").months[1].cards[0].performance[0].amount).toBeNull();
  target.performanceScopes[0].basis = "gross"; target.performanceScopes[0].benefitExclusions = ["base"];
  const other = policy({ performanceScopes: [], benefits: [] });
  const known = replayLedger({ ...snapshot, ruleVersions: [version("a", target), version("b", other)] }, "2026-02");
  expect(known.months[1].cards[0].performance[0].amount).toBe(10000);
});
it("rejects impossible calendar instants instead of moving them into a different month", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", capped())], transactions: [transaction("invalid", 10000, "2026-02-30T00:00:00Z")] }), "2026-03");
  expect(result.transactions[0].month).toBeNull();
  expect(result.transactions[0].reasons).toContain("ordering_unknown");
});
it("an untargeted correction preserves uncertainty instead of leaving a fresh quota for the next purchase", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", capped())], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("unknown"), transaction("later", 10000, "2026-02-03T00:00:00Z", "a", 2)], annotations: [annotation("unknown", 500, "benefit_eligible", { target_key: null, review_status: "needs_review", origin: "legacy_manual" })] }), "2026-02");
  expect(result.transactions[1].benefits[0].appliedAmount).toBeNull();
});
