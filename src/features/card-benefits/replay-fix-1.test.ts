import { describe, expect, it } from "vitest";
import { cardPolicySchema, type CardPolicy } from "./policy-schema";
import { replayLedger } from "./replay";
import { annotation, card, inputs, membership, monthData, policy, transaction, version } from "./replay.fixtures";

function capped(): CardPolicy {
  const rules = policy();
  rules.benefits[0] = { ...rules.benefits[0], performance: { kind: "none" }, quotaKeys: ["pool"] };
  rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 600 } }];
  return rules;
}

describe("review 1: omitted quota consumption", () => {
  it("rejects a default won pool for an identified points reward rather than capping points with won", () => {
    const rules = capped();
    rules.benefits[0] = { ...rules.benefits[0], benefitKind: "points", unit: { kind: "points", program: "alpha" }, reward: { kind: "fixed", amount: 1000 } };
    const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")], monthInputs: [monthData("2026-02", "quota", "pool")] }), "2026-02");
    expect(result.transactions[0].benefits).toEqual([]);
    expect(result.months[1].quotas).toEqual([]);
    expect(cardPolicySchema.safeParse(rules).success).toBe(false);
  });
  it("keeps omitted won consumption and explicitly matched point programs usable", () => {
    const won = replayLedger(inputs({ ruleVersions: [version("a", capped())], transactions: [transaction("one")], monthInputs: [monthData("2026-02", "quota", "pool")] }), "2026-02");
    expect(won.transactions[0].benefits[0].appliedAmount).toBe(500);
    const points = capped();
    points.benefits[0] = { ...points.benefits[0], benefitKind: "points", unit: { kind: "points", program: "alpha" }, reward: { kind: "fixed", amount: 1000 } };
    points.quotas[0].consumption = { kind: "benefit_amount", unit: { kind: "points", program: "alpha" } };
    const result = replayLedger(inputs({ ruleVersions: [version("a", points)], transactions: [transaction("one")], monthInputs: [monthData("2026-02", "quota", "pool")] }), "2026-02");
    expect(result.transactions[0].benefits[0]).toMatchObject({ appliedAmount: 600, unit: { kind: "points", program: "alpha" } });
    expect(result.months[1].quotas[0]).toMatchObject({ consumed: 600, remaining: 0, unit: { kind: "points", program: "alpha" } });
    points.quotas[0].consumption.unit = { kind: "points", program: "beta" };
    expect(cardPolicySchema.safeParse(points).success).toBe(false);
  });
});

describe("review 2: actual direct-contributor dependencies", () => {
  it.each(["including_transaction", "month_end"] as const)("isolates %s net-paid eligibility dependent on a contributor discount", (timing) => {
    const target = policy(); target.performanceScopes[0].contributorSlots = ["self", "partner"]; target.performanceScopes[0].basis = "net_paid";
    target.benefits[0] = { ...target.benefits[0], benefitKind: "points", unit: { kind: "points", program: "alpha" }, reward: { kind: "fixed", amount: 500 }, performance: { kind: "current_month", scopeKey: "spend", timing } };
    const contributor = policy(); contributor.benefits[0].performance = { kind: "none" }; contributor.benefits[0].reward = { kind: "percent", basisPoints: 1000, rounding: "floor" };
    const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", target), version("b", contributor)], memberships: [membership()], transactions: [transaction("b", 300000, "2026-02-01T00:00:00Z", "b"), transaction("a", 10000, undefined, "a", 2)] }), "2026-02");
    expect(result.transactions.find((row) => row.id === "a")?.benefits[0]).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["unsupported_performance_dependency"]) });
    expect(result.transactions.find((row) => row.id === "b")?.benefits[0].appliedAmount).toBe(30000);
    expect(result.months[1].cards[0].performance[0]).toMatchObject({ amount: 280000, status: "unmet" });
    expect(result.transactions.find((row) => row.id === "a")?.benefits[0].reasons).not.toContain("cyclic_performance_dependency");
  });
  it("keeps a missing contributor policy unknown rather than inventing benefit independence or a cycle", () => {
    const target = policy(); target.performanceScopes[0].contributorSlots = ["self", "partner"]; target.performanceScopes[0].basis = "net_paid";
    target.benefits[0] = { ...target.benefits[0], benefitKind: "points", unit: { kind: "points", program: "alpha" }, reward: { kind: "fixed", amount: 500 }, performance: { kind: "current_month", scopeKey: "spend", timing: "month_end" } };
    const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", target)], memberships: [membership()], transactions: [transaction("a"), transaction("b", 300000, "2026-02-03T00:00:00Z", "b", 2)] }), "2026-02");
    expect(result.transactions[0].benefits[0]).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["policy_unverified", "missing_performance"]) });
    expect(result.transactions[0].benefits[0].reasons).not.toContain("cyclic_performance_dependency");
  });
  it("does not import the contributor's own contributors or their dependencies", () => {
    const target = policy(); target.performanceScopes[0].contributorSlots = ["self", "partner"]; target.performanceScopes[0].basis = "net_paid";
    target.benefits[0] = { ...target.benefits[0], benefitKind: "points", unit: { kind: "points", program: "alpha" }, reward: { kind: "fixed", amount: 500 }, performance: { kind: "current_month", scopeKey: "spend", timing: "month_end" } };
    const direct = policy({ benefits: [] }); direct.performanceScopes[0].contributorSlots = ["self", "partner"];
    const indirect = policy(); indirect.benefits[0].performance = { kind: "none" };
    const result = replayLedger(inputs({ cards: [card(), card("b"), card("c")], ruleVersions: [version("a", target), version("b", direct), version("c", indirect)], memberships: [membership(), membership("b", "c")], transactions: [transaction("b", 300000, "2026-02-01T00:00:00Z", "b"), transaction("a", 10000, undefined, "a", 2), transaction("c", 400000, "2026-02-03T00:00:00Z", "c", 3)] }), "2026-02");
    expect(result.transactions.find((row) => row.id === "a")?.benefits[0].appliedAmount).toBe(500);
    expect(result.months[1].cards[0].performance[0].amount).toBe(310000);
  });
});

describe("review 3: one stable pool has one participant set", () => {
  it("rejects disjoint reciprocal groups claiming the same pool before either spends it", () => {
    const shared = capped(); shared.quotas[0].sharing = { kind: "shared", contributorSlots: ["self", "partner"] };
    const result = replayLedger(inputs({ cards: ["a", "b", "c", "d", "e"].map((id) => card(id)), ruleVersions: ["a", "b", "c", "d"].map((id) => version(id, shared)).concat(version("e", capped())), memberships: [membership("a", "b", "quota", "pool", "family"), membership("b", "a", "quota", "pool", "family"), membership("c", "d", "quota", "pool", "family"), membership("d", "c", "quota", "pool", "family")], monthInputs: [monthData("2026-02", "quota", "pool", { status: "complete" }, "family"), monthData("2026-02", "quota", "pool", { status: "complete" }, "card:e:quota:pool")], transactions: [transaction("a"), transaction("c", 10000, "2026-02-03T00:00:00Z", "c", 2), transaction("e", 10000, "2026-02-04T00:00:00Z", "e", 3)] }), "2026-02");
    expect(result.transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([null, null, 500]);
    expect(result.months[1].quotas.find((pool) => pool.scopeInstanceKey === "family")).toMatchObject({ consumed: null, remaining: null, reasons: expect.arrayContaining(["quota_definition_conflict"]) });
  });
});

describe("review 4: daily history is period-local", () => {
  it.each(["daily", "monthly"] as const)("keeps %s version compatibility inside its own consumption period", (period) => {
    const first = capped(); first.quotas[0].period = period;
    const second = structuredClone(first); second.quotas[0].limit = { kind: "fixed", amount: 1000 };
    const snapshot = inputs({ ruleVersions: [version("a", first), version("a", second, { id: "v2", version_order: 2, effective_from: "2026-02-15" })], transactions: [transaction("early"), transaction("late", 10000, "2026-02-16T00:00:00Z", "a", 2)], monthInputs: [monthData("2026-02", "quota", "pool")] });
    expect(replayLedger(snapshot, "2026-02").transactions.map((row) => row.benefits[0].appliedAmount)).toEqual(period === "daily" ? [500, 500] : [null, null]);
    expect(replayLedger({ ...snapshot, transactions: [snapshot.transactions[1]] }, "2026-02").transactions[0].benefits[0].appliedAmount).toBe(period === "daily" ? 500 : null);
  });
});

describe("review round 2: target-scoped annotation uncertainty", () => {
  function sharedSource() {
    const target = policy({ benefits: [] });
    target.performanceScopes[0].contributorSlots = ["self", "partner"];
    return inputs({
      cards: [card(), card("b")],
      ruleVersions: [version("a", target), version("b")],
      memberships: [membership("a", "b", "performance", "spend", "a-shared")],
      transactions: [transaction("feb", 300000, undefined, "b"), transaction("mar", 10000, "2026-03-02T00:00:00Z", "b", 2)],
      monthInputs: [monthData("2026-02", "performance", "spend", { status: "complete" }, "a-shared"), monthData("2026-02", "performance", "spend", { status: "complete" }, "card:b:performance:spend")],
    });
  }
  it.each([0, "0.25"] as const)("isolates a removed A key with retained instance, preserving raw %s and B's next-month benefit", (amount) => {
    const snapshot = sharedSource();
    const note = annotation("feb", amount, "performance", { target_key: "removed-a-scope", scope_instance_key: "a-shared", origin: typeof amount === "string" ? "legacy_manual" : "manual" });
    const control = replayLedger(snapshot, "2026-03");
    expect(control.transactions[0].recognized.find((scope) => scope.targetCardId === "b")?.appliedAmount).toBe(300000);
    expect(control.transactions[1].benefits[0].appliedAmount).toBe(500);
    const result = replayLedger({ ...snapshot, annotations: [note] }, "2026-03");
    expect({ recognized: result.transactions[0].recognized.find((scope) => scope.targetCardId === "b")?.appliedAmount, nextMonthBenefit: result.transactions[1].benefits[0].appliedAmount }).toEqual({ recognized: 300000, nextMonthBenefit: 500 });
    expect(result.transactions[0].recognized.find((scope) => scope.targetCardId === "a")).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["annotation_allocation_unknown"]) });
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
    expect(result.months[1].cards.find((entry) => entry.userCardId === "b")?.performance[0]).toMatchObject({ amount: 300000, tierKey: "base", reasons: [] });
  });
  it.each(["including_transaction", "month_end"] as const)("isolates identifiable A uncertainty in B's independent %s preview", (timing) => {
    const snapshot = sharedSource();
    const independent = policy(); independent.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing };
    const note = annotation("feb", 0, "performance", { target_key: "removed-a-scope", scope_instance_key: "a-shared" });
    const result = replayLedger({ ...snapshot, ruleVersions: [snapshot.ruleVersions[0], version("b", independent)], transactions: [snapshot.transactions[0]], annotations: [note] }, "2026-02");
    expect(result.transactions[0].benefits[0]).toMatchObject({ appliedAmount: 15000, reasons: [] });
    expect(result.transactions[0].recognized.find((scope) => scope.targetCardId === "a")?.appliedAmount).toBeNull();
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
  });
  it("still honors a resolved current A scope override without allocating the removed zero correction", () => {
    const snapshot = sharedSource();
    const stale = annotation("feb", 0, "performance", { target_key: "removed-a-scope", scope_instance_key: "a-shared" });
    const current = annotation("feb", 123000, "performance", { id: "current-a", target_key: "spend", scope_instance_key: "a-shared" });
    const result = replayLedger({ ...snapshot, annotations: [stale, current] }, "2026-03");
    expect(result.transactions[0].recognized.find((scope) => scope.targetCardId === "a")).toMatchObject({ automaticAmount: null, appliedAmount: 123000, source: "manual" });
    expect(result.transactions[0].recognized.find((scope) => scope.targetCardId === "b")?.appliedAmount).toBe(300000);
    expect(result.transactions[0].unallocatedAnnotations).toEqual([stale]);
  });
  it("does not treat a noncontributing old card's still-existing instance as an identified current target", () => {
    const snapshot = sharedSource();
    const oldCard = card("old");
    const note = annotation("feb", 0, "performance", { target_key: "removed", scope_instance_key: "card:old:performance:spend" });
    const result = replayLedger({ ...snapshot, cards: [...snapshot.cards, oldCard], ruleVersions: [...snapshot.ruleVersions, version("old")], annotations: [note] }, "2026-03");
    expect(result.transactions[0].recognized.map((scope) => scope.appliedAmount)).toEqual([null, null]);
    expect(result.transactions[1].benefits[0].appliedAmount).toBeNull();
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
  });
});

describe("review 5: disappeared annotation targets", () => {
  it.each([
    ["confirmed_benefit", 2000], ["confirmed_benefit", 0], ["benefit_eligible", 2000], ["benefit_eligible", 0], ["confirmed_benefit", "2000.25"],
  ] as const)("preserves unmapped %s %s without relabeling it or confirming net-paid recognition", (kind, amount) => {
    const rules = capped(); rules.benefits[0].key = "renamed"; rules.performanceScopes[0].basis = "net_paid";
    rules.performanceScopes.push({ ...rules.performanceScopes[0], key: "gross", basis: "gross" });
    const note = annotation("one", amount, kind, { basis_auto_amount: 999999, basis_rule_version_id: "old-v", origin: typeof amount === "string" ? "legacy_manual" : "manual" });
    const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")], annotations: [note], monthInputs: [monthData("2026-02"), monthData("2026-02", "performance", "gross"), monthData("2026-02", "quota", "pool")] }), "2026-02");
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
    expect(result.transactions[0].benefits[0]).toMatchObject({ automaticAmount: 500, estimatedOverride: null, confirmedBenefit: null });
    expect(result.transactions[0].recognized.find((scope) => scope.scopeKey === "spend")).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["annotation_allocation_unknown"]) });
    expect(result.transactions[0].recognized.find((scope) => scope.scopeKey === "gross")?.appliedAmount).toBe(10000);
    expect(result.months[1].quotas[0].remaining).toBeNull();
    expect(note.review_status).toBe("resolved");
  });
  it("does not claim benefit-dependent exclusion is known when a benefit correction cannot be allocated", () => {
    const rules = capped(); rules.benefits[0].key = "renamed"; rules.performanceScopes[0].benefitExclusions = ["renamed"];
    const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")], annotations: [annotation("one", 0, "confirmed_benefit")], monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")] }), "2026-02");
    expect(result.transactions[0].recognized[0].appliedAmount).toBeNull();
  });
  it.each([
    { target_key: "removed", scope_instance_key: "card:a:performance:spend" },
    { target_key: "spend", scope_instance_key: "old-instance" },
  ])("retains a performance override whose key or instance no longer identifies a current scope", (target) => {
    const note = annotation("one", 300000, "performance", target);
    const result = replayLedger(inputs({ ruleVersions: [version("a", capped())], transactions: [transaction("one")], annotations: [note], monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")] }), "2026-02");
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
    expect(result.transactions[0].recognized[0].appliedAmount).toBeNull();
    expect(result.transactions[0].benefits[0].appliedAmount).toBe(500);
    expect(result.months[1].quotas[0].remaining).toBe(100);
  });
  it("does not silently lose an old card's performance correction after a source card edit", () => {
    const note = annotation("one", 300000, "performance", { target_key: "spend", scope_instance_key: "card:a:performance:spend" });
    const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", capped()), version("b", capped())], transactions: [transaction("one", 10000, undefined, "b")], annotations: [note], monthInputs: [monthData("2026-02", "performance", "spend", { status: "complete" }, "card:b:performance:spend"), monthData("2026-02", "quota", "pool", { status: "complete" }, "card:b:quota:pool")] }), "2026-02");
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
    expect(result.transactions[0].recognized[0]).toMatchObject({ targetCardId: "b", appliedAmount: null });
  });
  it.each(["including_transaction", "month_end"] as const)("propagates unmapped performance corrections into %s previews but honors exact current overrides", (timing) => {
    const rules = policy(); rules.benefits[0].performance = { kind: "current_month", scopeKey: "spend", timing };
    const stale = annotation("one", 0, "performance", { target_key: "old", scope_instance_key: "old-instance" });
    const exact = annotation("one", 300000, "performance", { id: "current", target_key: "spend", scope_instance_key: "card:a:performance:spend" });
    const independent = policy(); independent.benefits[0].performance = { kind: "none" };
    const snapshot = inputs({ cards: [card(), card("b")], ruleVersions: [version("a", rules), version("b", independent)], transactions: [transaction("one", 300000), transaction("other", 10000, "2026-02-03T00:00:00Z", "b", 2)], annotations: [stale] });
    const unknown = replayLedger(snapshot, "2026-02");
    expect(unknown.transactions[0].benefits[0]).toMatchObject({ appliedAmount: null, reasons: expect.arrayContaining(["annotation_allocation_unknown"]) });
    expect(unknown.transactions[1].benefits[0].appliedAmount).toBe(500);
    const fixed = replayLedger({ ...snapshot, annotations: [stale, exact] }, "2026-02");
    expect(fixed.transactions[0].unallocatedAnnotations).toEqual([stale]);
    expect(fixed.transactions[0].benefits[0].appliedAmount).toBe(15000);
    expect(fixed.transactions[0].recognized[0]).toMatchObject({ automaticAmount: null, appliedAmount: 300000, source: "manual" });
  });
  it("preserves facts even when the current card has no usable policy", () => {
    const note = annotation("one", 2000, "confirmed_benefit");
    const result = replayLedger(inputs({ ruleVersions: [], transactions: [transaction("one")], annotations: [note] }), "2026-02");
    expect(result.transactions[0].unallocatedAnnotations).toEqual([note]);
    expect(result.transactions[0].reasons).toContain("annotation_allocation_unknown");
  });
});
