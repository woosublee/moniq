import { expect, it } from "vitest";
import { capBenefit } from "./quotas";
import { replayLedger } from "./replay";
import { inputs, monthData, policy, transaction, version, card, membership } from "./replay.fixtures";
import type { CardPolicy } from "./policy-schema";

function quotaPolicy(): CardPolicy {
  return policy({ performanceScopes: [], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["pool"] }], quotas: [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 600 } }] });
}
it.each([[3000, 2000, 1500, 1500], [3000, null, 0, 0], [3000, null, null, 3000]])("caps %i without treating zero as unlimited", (raw, per, monthly, expected) => {
  expect(capBenefit(raw!, per, monthly)).toBe(expected);
});
it("applies transaction, daily benefit money, monthly eligible spend and monthly count independently", () => {
  const rules = quotaPolicy();
  rules.quotas = [
    { key: "day", sharing: { kind: "independent" }, period: "daily", consumption: { kind: "benefit_amount", unit: { kind: "won" } }, limit: { kind: "fixed", amount: 600 } },
    { key: "spend", sharing: { kind: "independent" }, consumption: { kind: "eligible_spend" }, limit: { kind: "fixed", amount: 15000 } },
    { key: "count", sharing: { kind: "independent" }, consumption: { kind: "count" }, limit: { kind: "fixed", amount: 2 } },
  ];
  rules.benefits[0] = { ...rules.benefits[0], transactionLimit: 400, quotaKeys: ["day", "spend", "count"] };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one"), transaction("two", 10000, "2026-02-02T02:00:00Z", "a", 2), transaction("three", 10000, "2026-02-03T01:00:00Z", "a", 3)], monthInputs: ["day", "spend", "count"].map((key) => monthData("2026-02", "quota", key)) }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([400, 200, 0]);
  expect(result.months[1].quotas.find((row) => row.scopeKey === "spend")?.consumed).toBe(15000);
  expect(result.months[1].quotas.find((row) => row.scopeKey === "count")?.consumed).toBe(2);
});
it("resets a daily count at Seoul midnight, not at each transaction", () => {
  const rules = quotaPolicy();
  rules.quotas[0] = { ...rules.quotas[0], period: "daily", consumption: { kind: "count" }, limit: { kind: "fixed", amount: 1 } };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("first", 10000, "2026-02-02T14:00:00Z"), transaction("same", 10000, "2026-02-02T14:30:00Z", "a", 2), transaction("next", 10000, "2026-02-02T15:00:00Z", "a", 3)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([500, 0, 500]);
});
it("shares one pool across benefit items and card instances without duplicating spend recognition", () => {
  const rules = quotaPolicy();
  rules.quotas[0].sharing = { kind: "shared", contributorSlots: ["self", "partner"] };
  const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", rules), version("b", rules)], memberships: [membership("a", "b", "quota", "pool", "family"), membership("b", "a", "quota", "pool", "family")], monthInputs: [monthData("2026-02", "quota", "pool", { status: "complete" }, "family")], transactions: [transaction("a"), transaction("b", 10000, "2026-02-03T00:00:00Z", "b", 2)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([500, 100]);
  expect(result.months[1].quotas).toHaveLength(1);
});
it("carries consumption across v1 to v2 with the same pool and definition", () => {
  const rules = quotaPolicy();
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules), version("a", rules, { id: "v2", version_order: 2, effective_from: "2026-02-15" })], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("v1"), transaction("v2", 10000, "2026-02-16T00:00:00Z", "a", 2)] }), "2026-02");
  expect(result.transactions.map((row) => [row.ruleVersionId, row.benefits[0].appliedAmount])).toEqual([["v-a", 500], ["v2", 100]]);
});
it("does not reset a pool when v2 changes cap meaning or loses its membership binding", () => {
  const rules = quotaPolicy();
  const changed = structuredClone(rules);
  changed.quotas[0].limit = { kind: "fixed", amount: 2000 };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules), version("a", changed, { id: "v2", version_order: 2, effective_from: "2026-02-15" })], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("v1"), transaction("v2", 10000, "2026-02-16T00:00:00Z", "a", 2)] }), "2026-02");
  expect(result.transactions[1].benefits[0]).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["quota_definition_conflict"]) });
  const shared = quotaPolicy();
  shared.quotas[0].sharing = { kind: "shared", contributorSlots: ["self", "partner"] };
  const lost = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", shared), version("a", shared, { id: "v2", version_order: 2, effective_from: "2026-02-15" })], memberships: [membership("a", "b", "quota", "pool", "family")], monthInputs: [monthData("2026-02", "quota", "pool", { status: "complete" }, "family"), monthData("2026-02", "quota", "pool")], transactions: [transaction("v1"), transaction("v2", 10000, "2026-02-16T00:00:00Z", "a", 2)] }), "2026-02");
  expect(lost.transactions[1].benefits[0].appliedAmount).toBeNull();
});
it("detects incompatible resolved tier caps before awarding any shared-pool benefit", () => {
  const shared = quotaPolicy(); shared.performanceScopes = policy().performanceScopes;
  shared.quotas[0] = { key: "pool", sharing: { kind: "shared", contributorSlots: ["self", "partner"] }, limit: { kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "base", amount: 600 }, { tierKey: "plus", amount: 1000 }] } };
  const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", shared), version("b", shared)], memberships: [membership("a", "b", "quota", "pool", "family"), membership("b", "a", "quota", "pool", "family")], monthInputs: [monthData("2026-01", "performance", "spend", { status: "manual_total", amount: 300000 }), monthData("2026-01", "performance", "spend", { status: "manual_total", amount: 600000 }, "card:b:performance:spend"), monthData("2026-02", "quota", "pool", { status: "complete" }, "family")], transactions: [transaction("a"), transaction("b", 10000, "2026-02-03T00:00:00Z", "b", 2)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([null, null]);
});
it("consumes a shared transaction count once when two explicitly stacked benefits apply", () => {
  const rules = quotaPolicy(); rules.quotas[0] = { ...rules.quotas[0], consumption: { kind: "count" }, limit: { kind: "fixed", amount: 1 } };
  rules.benefits = [{ ...rules.benefits[0], combination: { kind: "stack", with: ["extra"], priority: 1 } }, { ...rules.benefits[0], key: "extra", combination: { kind: "stack", with: ["base"], priority: 2 } }];
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("one"), transaction("two", 10000, "2026-02-03T00:00:00Z", "a", 2)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits.map((benefit) => benefit.appliedAmount))).toEqual([[500, 500], [0, 0]]);
  expect(result.months[1].quotas[0].consumed).toBe(1);
});
it("does not reuse a month-only opening remainder as every day's balance", () => {
  const rules = quotaPolicy(); rules.quotas[0].period = "daily";
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], monthInputs: [monthData("2026-02", "quota", "pool", { status: "remaining", amount: 100 })], transactions: [transaction("one"), transaction("two", 10000, "2026-02-03T00:00:00Z", "a", 2)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([null, null]);
});
it("does not invent reciprocal shared-pool membership while leaving an independent target usable", () => {
  const shared = quotaPolicy(); shared.quotas[0].sharing = { kind: "shared", contributorSlots: ["self", "partner"] };
  const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", shared), version("b", quotaPolicy())], memberships: [membership("a", "b", "quota", "pool", "family")], monthInputs: [monthData("2026-02", "quota", "pool", { status: "complete" }, "family"), monthData("2026-02", "quota", "pool", { status: "complete" }, "card:b:quota:pool")], transactions: [transaction("b", 10000, "2026-02-01T00:00:00Z", "b"), transaction("a", 10000, undefined, "a", 2)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([500, null]);
});
it("validates policy/membership continuity even when a version has no purchase", () => {
  const rules = quotaPolicy();
  const changed = structuredClone(rules); changed.quotas[0].limit = { kind: "fixed", amount: 2000 };
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules), version("a", changed, { id: "v2", version_order: 2, effective_from: "2026-02-15" })], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [transaction("only-v2", 10000, "2026-02-16T00:00:00Z")] }), "2026-02");
  expect(result.transactions[0].benefits[0].appliedAmount).toBeNull();
});
it("does not award an opening remainder above the verified period cap", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", quotaPolicy())], monthInputs: [monthData("2026-02", "quota", "pool", { status: "remaining", amount: 2000 })], transactions: [transaction("one", 20000)] }), "2026-02");
  expect(result.transactions[0].benefits[0].appliedAmount).toBeNull();
  expect(result.months[1].quotas[0].reasons).toContain("quota_definition_conflict");
});
it("does not infer quota completeness from manual previous-month performance", () => {
  const rules = quotaPolicy();
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], monthInputs: [monthData("2026-01", "performance", "spend", { status: "manual_total", amount: 300000 })], transactions: [transaction("one")] }), "2026-02");
  expect(result.transactions[0].benefits[0]).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["quota_unknown"]) });
});
