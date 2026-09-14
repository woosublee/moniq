import { expect, it } from "vitest";
import { replayLedger } from "./replay";
import { annotation, card, inputs, monthData, policy, transaction, version } from "./replay.fixtures";
import type { CardPolicy } from "./policy-schema";
function rules(): CardPolicy {
  const base = policy();
  base.benefits[0].performance = { kind: "none" };
  return base;
}
function stacked(): CardPolicy {
  const result = rules();
  result.benefits = [
    { ...result.benefits[0], key: "base", reward: { kind: "fixed", amount: 1000 }, combination: { kind: "stack", with: ["extra"], priority: 1 } },
    { ...result.benefits[0], key: "extra", reward: { kind: "percent", basisPoints: 1000, rounding: "floor" }, recognitionBasis: "net_paid", combination: { kind: "stack", with: ["base"], priority: 2 } },
  ];
  return result;
}
it("uses only explicitly ordered preceding won discounts for net_paid and recognizes the purchase once", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", stacked())], transactions: [transaction("one")] }), "2026-02");
  expect(result.transactions[0].benefits.map((row) => row.appliedAmount)).toEqual([1000, 900]);
  expect(result.months[1].cards[0].performance[0].amount).toBe(10000);
  const net = stacked(); net.performanceScopes[0].basis = "net_paid";
  expect(replayLedger(inputs({ ruleVersions: [version("a", net)], transactions: [transaction("one")] }), "2026-02").months[1].cards[0].performance[0].amount).toBe(8100);
});
it("propagates an unknown preceding discount only to dependent net_paid rewards", () => {
  const source = stacked();
  source.benefits[0].conditions = [{ kind: "channel", values: ["online"] }];
  const result = replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [{ ...transaction("one"), payment_channel: "unknown" }] }), "2026-02");
  expect(result.transactions[0].benefits.map((row) => row.appliedAmount)).toEqual([null, null]);
});
it("does not subtract points, miles or cashback from a stacked net_paid reward", () => {
  const source = stacked();
  source.benefits[0] = { ...source.benefits[0], benefitKind: "points", unit: { kind: "miles", program: "synthetic" } };
  expect(replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [transaction("one")] }), "2026-02").transactions[0].benefits.map((row) => row.appliedAmount)).toEqual([1000, 1000]);
});
it("never guesses stacking or a net_paid evaluation order", () => {
  const source = rules(); source.benefits.push({ ...source.benefits[0], key: "extra" });
  expect(replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [transaction("one")] }), "2026-02").transactions[0].benefits.map((row) => row.appliedAmount)).toEqual([null, null]);
  const single = rules(); single.benefits[0].recognitionBasis = "net_paid";
  expect(replayLedger(inputs({ ruleVersions: [version("a", single)], transactions: [transaction("one")] }), "2026-02").transactions[0].benefits[0].reasons).toContain("unsupported_condition");
});
it("selects only a verified exclusive group's priority instead of an implicit largest reward", () => {
  const source = rules();
  source.benefits = [
    { ...source.benefits[0], reward: { kind: "fixed", amount: 100 }, combination: { kind: "exclusive", group: "choice", selection: "priority", priority: 1 } },
    { ...source.benefits[0], key: "large", reward: { kind: "fixed", amount: 200 }, combination: { kind: "exclusive", group: "choice", selection: "priority", priority: 2 } },
  ];
  expect(replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [transaction("one")] }), "2026-02").transactions[0].benefits.map((row) => row.appliedAmount)).toEqual([100, 0]);
});
it("does not compare different programs or sum points into won", () => {
  const source = rules();
  source.benefits = [
    { ...source.benefits[0], combination: { kind: "exclusive", group: "choice", selection: "maximum", priority: 1 } },
    { ...source.benefits[0], key: "point", benefitKind: "points", unit: { kind: "points", program: "alpha" }, reward: { kind: "fixed", amount: 1000 }, combination: { kind: "exclusive", group: "choice", selection: "maximum", priority: 2 } },
  ];
  const result = replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [transaction("one")] }), "2026-02");
  expect(result.transactions[0].benefits.map((row) => row.appliedAmount)).toEqual([null, null]);
  expect(result.transactions[0].benefits[0].reasons).toContain("unit_unknown");
  expect(result.months[1].cards[0].benefits.map((row) => row.unit)).toEqual([{ kind: "points", program: "alpha" }, { kind: "won" }]);
});
it("keeps the automatic estimate, fixed estimate and confirmed zero separately; confirmed wins quota and performance", () => {
  const source = rules(); source.performanceScopes[0].benefitExclusions = ["base"];
  source.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 600 } }]; source.benefits[0].quotaKeys = ["pool"];
  const result = replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [transaction("one"), transaction("two", 10000, "2026-02-03T00:00:00Z", "a", 2)], monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")], annotations: [annotation("one", 200), annotation("one", 0, "confirmed_benefit")] }), "2026-02");
  expect(result.transactions[0].benefits[0]).toMatchObject({ automaticAmount: 500, estimatedOverride: 200, confirmedBenefit: 0, appliedAmount: 0, appliedSource: "confirmed" });
  expect(result.transactions[1].benefits[0].automaticAmount).toBe(500);
  expect(result.months[1].cards[0].performance[0].amount).toBe(10000);
});
it("keeps manual fixed zero even when the next month's eligibility changes", () => {
  const source = rules(); source.performanceScopes[0].basis = "net_paid";
  const result = replayLedger(inputs({ ruleVersions: [version("a", source)], transactions: [transaction("one")], annotations: [annotation("one", 0)] }), "2026-02");
  expect(result.transactions[0].benefits[0]).toMatchObject({ automaticAmount: 500, estimatedOverride: 0, appliedAmount: 0, appliedSource: "estimated_override" });
  expect(result.months[1].cards[0].performance[0].amount).toBe(10000);
});
it("never promotes a needs_review legacy confirmation or its basis snapshot into an applied fact", () => {
  const result = replayLedger(inputs({ ruleVersions: [version("a", rules())], transactions: [transaction("one")], annotations: [annotation("one", 0), annotation("one", "123.4", "confirmed_benefit", { review_status: "needs_review", origin: "legacy_manual" })] }), "2026-02");
  expect(result.transactions[0].benefits[0]).toMatchObject({ appliedAmount: 0, confirmedBenefit: null, estimatedOverride: 0, reasons: expect.arrayContaining(["annotation_needs_review"]) });
});
it("applies a scoped performance override once and carries its value into next-month eligibility", () => {
  const result = replayLedger(inputs({ transactions: [transaction("jan", 10000, "2026-01-02T00:00:00Z"), transaction("feb")], annotations: [annotation("jan", 300000, "performance", { target_key: "spend", scope_instance_key: "card:a:performance:spend" })] }), "2026-02");
  expect(result.transactions[0].recognized[0]).toMatchObject({ automaticAmount: 10000, appliedAmount: 300000, source: "manual" });
  expect(result.transactions[1].benefits[0].automaticAmount).toBe(500);
});
it("poisons only affected pools when a positive override has unknown eligible-spend allocation", () => {
  const source = rules();
  source.quotas = [{ key: "pool", sharing: { kind: "independent" }, consumption: { kind: "eligible_spend" }, limit: { kind: "fixed", amount: 20000 } }];
  source.benefits[0].quotaKeys = ["pool"];
  source.benefits[0].conditions = [{ kind: "channel", values: ["online"] }];
  const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", source), version("b", rules())], monthInputs: [monthData("2026-02", "quota", "pool")], transactions: [{ ...transaction("one"), payment_channel: "unknown" }, { ...transaction("two", 10000, "2026-02-03T00:00:00Z", "a", 2), payment_channel: "online" }, transaction("independent", 10000, "2026-02-04T00:00:00Z", "b", 3)], annotations: [annotation("one", 1000)] }), "2026-02");
  expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([1000, null, 500]);
  expect(result.months[1].quotas[0].reasons).toContain("annotation_allocation_unknown");
});
