import { describe, expect, it } from "vitest";
import { replayLedger } from "./replay";
import { card, inputs, membership, monthData, policy, refund, transaction, version } from "./replay.fixtures";

const noRequirement = () => policy({ performanceScopes: [], benefits: [{ ...policy().benefits[0], performance: { kind: "none" } }] });

describe("monthly ledger replay", () => {
  it.each([[299999, 0], [300000, 500]])("uses the previous month's %i won, not this month's purchases", (previous, expected) => {
    const result = replayLedger(inputs({ transactions: [transaction("feb", 10000), transaction("jan", previous, "2026-01-31T14:00:00Z", "a", 2)] }), "2026-02");
    expect(result.transactions.find((row) => row.id === "feb")?.benefits[0].automaticAmount).toBe(expected);
    expect(result.months[1].cards[0].performance[0].amount).toBe(10000);
  });
  it("keeps missing start-month data unknown rather than pretending it is zero", () => {
    const result = replayLedger(inputs({ startMonth: "2026-02", monthInputs: [monthData("2026-02")], transactions: [transaction("feb", 700000)] }), "2026-02");
    expect(result.transactions[0].benefits[0]).toMatchObject({ automaticAmount: null, reasons: ["missing_performance"] });
  });
  it("supports verified no-requirement policies without turning unverified policies into them", () => {
    const result = replayLedger(inputs({ cards: [card(), card("b")], ruleVersions: [version("a", noRequirement()), version("b", noRequirement(), { verification_status: "unverified" })], transactions: [transaction("a"), transaction("b", 10000, undefined, "b", 2)] }), "2026-02");
    expect(result.transactions[0].benefits[0].appliedAmount).toBe(500);
    expect(result.months[1].cards.map((row) => row.requirementStatus)).toEqual(["no_requirement", "unverified"]);
    expect(result.transactions[1].reasons).toContain("policy_unverified");
  });
  it("replays Seoul dates and immutable bigint sequences deterministically without mutating inputs", () => {
    const rules = noRequirement();
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 600 } }];
    rules.benefits[0].quotaKeys = ["pool"];
    const snapshot = inputs({ ruleVersions: [version("a", rules)], monthInputs: [monthData("2026-02", "quota", "pool")],
      transactions: [transaction("second", 10000, "2026-01-31T15:00:00Z", "a", "9007199254740994"), transaction("first", 10000, "2026-01-31T15:00:00Z", "a", "9007199254740993")] });
    const original = structuredClone(snapshot);
    const result = replayLedger(snapshot, "2026-02");
    expect(result.transactions.map((row) => [row.id, row.month, row.benefits[0].appliedAmount])).toEqual([["first", "2026-02", 500], ["second", "2026-02", 100]]);
    expect(replayLedger(snapshot, "2026-02")).toEqual(result);
    expect(snapshot).toEqual(original);
  });
  it("retains a manual scope total including zero and reports disagreement without adding it", () => {
    const result = replayLedger(inputs({ transactions: [transaction("jan", 10000, "2026-01-02T00:00:00Z"), transaction("feb")], monthInputs: [monthData("2026-01", "performance", "spend", { status: "manual_total", amount: 300000 }), monthData("2026-02", "performance", "spend", { status: "manual_total", amount: 0 })] }), "2026-02");
    expect(result.transactions[1].benefits[0].automaticAmount).toBe(500);
    expect(result.months[0].cards[0].performance[0]).toMatchObject({ amount: 300000, ledgerAmount: 10000, source: "manual_total", reasons: ["manual_total_mismatch"] });
    expect(result.months[1].cards[0].performance[0]).toMatchObject({ amount: 0, status: "known_zero" });
  });
  it("separates achieved highest tier from a personal target", () => {
    const result = replayLedger(inputs({ cards: [{ ...card(), target_scope_key: "spend", target_tier_key: "plus" }], transactions: [transaction("feb", 300000)] }), "2026-02");
    expect(result.months[1].cards[0].performance[0]).toMatchObject({ status: "met", tierKey: "base", nextTierKey: "plus", remaining: 300000, target: { tierKey: "plus", status: "unmet", remaining: 300000 } });
  });
  it("does not turn unsupported legacy decimal principal into a rounded or zero reward", () => {
    const row = { ...transaction("decimal"), actual_amount: "1000.25" };
    const result = replayLedger(inputs({ ruleVersions: [version("a", noRequirement())], transactions: [row] }), "2026-02");
    expect(result.transactions[0]).toMatchObject({ netAmount: null, reasons: expect.arrayContaining(["precision_unknown"]) });
    expect(result.transactions[0].benefits[0].automaticAmount).toBeNull();
    expect(row.actual_amount).toBe("1000.25");
  });
});

describe("directed performance scopes", () => {
  it("counts B for A once, never C through B, and leaves B's own total separate", () => {
    const rules = policy();
    rules.performanceScopes[0].contributorSlots = ["self", "partner", "second"];
    const result = replayLedger(inputs({ cards: [card(), card("b"), card("c")], ruleVersions: [version("a", rules), version("b", rules), version("c")], memberships: [membership(), membership("a", "b", "performance", "spend", undefined, { id: "second", contributor_slot: "second" }), membership("b", "c")], transactions: [transaction("a", 100000), transaction("b", 200000, undefined, "b", 2), transaction("c", 400000, undefined, "c", 3)], monthInputs: [monthData("2026-02"), monthData("2026-02", "performance", "spend", { status: "complete" }, "card:b:performance:spend"), monthData("2026-02", "performance", "spend", { status: "complete" }, "card:c:performance:spend")] }), "2026-02");
    expect(result.months[1].cards.map((row) => row.performance[0].amount)).toEqual([300000, 600000, 400000]);
    expect(result.transactions[1].recognized.filter((row) => row.targetCardId === "a")).toHaveLength(1);
  });
});

describe("version and source edits", () => {
  it("re-evaluates prior recognized money against the current version's tiers, not old tier labels", () => {
    const changed = policy(); changed.performanceScopes[0].tiers = [{ key: "new-base", minimumSpend: 400000 }];
    const snapshot = inputs({ ruleVersions: [version(), version("a", changed, { id: "v2", version_order: 2, effective_from: "2026-02-01" })], transactions: [transaction("jan", 300000, "2026-01-02T00:00:00Z"), transaction("feb")] });
    expect(replayLedger(snapshot, "2026-02").transactions[1].benefits[0].appliedAmount).toBe(0);
  });
  it("uses a stable performance instance across version-specific membership rows", () => {
    const rules = policy(); rules.performanceScopes[0].contributorSlots = ["self", "partner"];
    const snapshot = inputs({ cards: [card(), card("b")], ruleVersions: [version("a", rules), version("a", rules, { id: "v2", version_order: 2, effective_from: "2026-02-01" }), version("b")], memberships: [membership("a", "b", "performance", "spend", "a-with-b", { valid_until_month: "2026-02-01" }), membership("a", "b", "performance", "spend", "a-with-b", { id: "v2-membership", rule_version_id: "v2", valid_from_month: "2026-02-01" })], monthInputs: [monthData("2026-01", "performance", "spend", { status: "complete" }, "a-with-b")], transactions: [transaction("jan-b", 300000, "2026-01-02T00:00:00Z", "b"), transaction("feb-a")] });
    expect(replayLedger(snapshot, "2026-02").transactions[1].benefits[0].appliedAmount).toBe(500);
  });
  it("a backdated/card edit naturally recomputes subsequent eligibility without reading snapshots", () => {
    const snapshot = inputs({ cards: [card(), card("b")], ruleVersions: [version(), version("b")], transactions: [transaction("threshold", 300000, "2026-01-02T00:00:00Z"), transaction("feb")], monthInputs: [monthData("2026-01"), monthData("2026-02")] });
    expect(replayLedger(snapshot, "2026-02").transactions[1].benefits[0].appliedAmount).toBe(500);
    snapshot.transactions = [{ ...snapshot.transactions[0], user_card_id: "b", version: 2 }, snapshot.transactions[1]];
    expect(replayLedger(snapshot, "2026-02").transactions[1].benefits[0].appliedAmount).toBe(0);
  });
});

describe("refund attribution", () => {
  it("replays original-month net purchases even for refunds after throughMonth and reallocates the pool", () => {
    const rules = noRequirement();
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 600 } }];
    rules.benefits[0].quotaKeys = ["pool"];
    const snapshot = inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one"), transaction("two", 10000, "2026-02-03T01:00:00Z", "a", 2)], adjustments: [refund("one", 8000)], monthInputs: [monthData("2026-02", "quota", "pool")] });
    expect(replayLedger(snapshot, "2026-02").transactions.map((row) => row.benefits[0].appliedAmount)).toEqual([100, 500]);
    const result = replayLedger(snapshot, "2026-03");
    expect(result.months[1].cards[0].cashFlow.amount).toBe(20000);
    expect(result.months[2].cards[0].cashFlow.amount).toBe(-8000);
  });
  it.each(["unknown", "verified_unsupported"] as const)("does not dispatch %s cancellation as net replay", (kind) => {
    const rules = noRequirement();
    rules.cancellation = kind === "unknown" ? { kind } : { kind, description: "Synthetic proportional recovery" };
    const result = replayLedger(inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")], adjustments: [refund("one", 1000)] }), "2026-02");
    expect(result.transactions[0].benefits[0].appliedAmount).toBeNull();
    expect(result.transactions[0].reasons).toContain(kind === "unknown" ? "refund_policy_unknown" : "unsupported_condition");
  });
});
