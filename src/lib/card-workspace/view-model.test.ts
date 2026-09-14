import { describe, expect, it } from "vitest";
import { annotation, card, inputs, monthData, policy, refund, transaction, version } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";

describe("final fix: excluded source contributions", () => {
  it("removes all economic contributions and linked refunds, then restores from untouched sources", async () => {
    const rules = policy();
    rules.benefits[0].performance = { kind: "none" };
    rules.benefits[0].quotaKeys = ["pool"];
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }];
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("wrong"), transaction("normal", 10000, "2026-02-03T01:00:00Z", "a", 2)],
      annotations: [annotation("wrong", 777, "performance", { target_key: "spend", scope_instance_key: "card:a:performance:spend" })],
      adjustments: [refund("wrong", 1000)], monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")] });
    const { buildCardWorkspace } = await import("./view-model");
    const build = (snapshot: typeof source, month: "2026-02" | "2026-03" = "2026-02") => buildCardWorkspace(snapshot, "7", month, replayLedger(snapshot, month));
    const original = structuredClone(source);
    const restored = build(source);
    const excluded = { ...source, transactions: source.transactions.map(row => row.id === "wrong" ? { ...row, input_excluded: true } : row) };
    const workspace = build(excluded);
    expect(workspace.transactions.find(row => row.id === "normal")?.workspace?.benefitAmount).toBe(500);
    expect(workspace.totals).toMatchObject({ actualAmount: 10000, finalAmount: 9500, benefitAmount: 500, cashFlowAmount: 10000, eligibleSpendAmount: 10000 });
    expect(workspace.summaries[0].workspace?.performance[0].ledgerAmount).toBe(10000);
    expect(workspace.replay.months[1].quotas[0]).toMatchObject({ consumed: 500, remaining: 0 });
    expect(build(excluded, "2026-03").totals.cashFlowAmount).toBe(0);
    expect(workspace.transactions.find(row => row.id === "wrong")?.workspace).toMatchObject({ actualAmount: 0, finalAmount: 0, benefitAmount: 0, eligibleSpendAmount: 0 });
    expect(build({ ...excluded, transactions: excluded.transactions.map(row => ({ ...row, input_excluded: false })) })).toEqual(restored);
    expect(source).toEqual(original);
    expect(restored.totals).toMatchObject({ benefitAmount: 500, cashFlowAmount: 20000, eligibleSpendAmount: 10777 });
    expect(build(source, "2026-03").totals.cashFlowAmount).toBe(-1000);
  });
  it("does not propagate excluded invalid chronology, decimals, stale notes or refund policy uncertainty", async () => {
    const rules = policy(); rules.benefits[0].performance = { kind: "none" }; rules.benefits[0].quotaKeys = ["pool"];
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }];
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [{ ...transaction("wrong", 10000, "invalid"), actual_amount: "0.125", input_excluded: true }, transaction("normal")],
      annotations: [annotation("wrong", "0.25", "confirmed_benefit", { target_key: null, review_status: "needs_review" })], adjustments: [refund("wrong", "0.125")],
      monthInputs: [monthData("2026-02"), monthData("2026-02", "quota", "pool")] });
    const { buildCardWorkspace } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.totals).toMatchObject({ finalAmount: 9500, benefitAmount: 500, eligibleSpendAmount: 10000 });
    expect(workspace.replay.issues).toEqual([]);
    expect(workspace.inputs.annotations[0].amount).toBe("0.25");
    expect(workspace.transactions.find(row => row.id === "wrong")?.workspace?.projection.unresolvedAnnotations).toEqual(source.annotations);
  });
});

describe("final fix: PostgreSQL microsecond chronology", () => {
  it("keeps precise instants ordered before sequence tie breaks and attributes KST boundaries without rewriting sources", async () => {
    const rules = policy(); rules.benefits[0].performance = { kind: "none" }; rules.benefits[0].quotaKeys = ["pool"];
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }];
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [
      transaction("later", 10000, "2026-02-01T00:00:00.123456+09:00", "a", 1),
      transaction("earlier", 10000, "2026-01-31T15:00:00.123455+00:00", "a", 9),
      transaction("jan", 10000, "2026-01-31T14:59:59.999999Z", "a", 5),
    ], monthInputs: [monthData("2026-01"), monthData("2026-02"), monthData("2026-02", "quota", "pool")] });
    const original = structuredClone(source);
    const { buildCardWorkspace, seoulMonth } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.replay.transactions.map(row => [row.id, row.day, row.month])).toEqual([["jan", "2026-01-31", "2026-01"], ["earlier", "2026-02-01", "2026-02"], ["later", "2026-02-01", "2026-02"]]);
    expect(workspace.transactions.find(row => row.id === "earlier")?.workspace?.benefitAmount).toBe(500);
    expect(workspace.transactions.find(row => row.id === "later")?.workspace?.benefitAmount).toBe(0);
    expect(workspace.totals).toMatchObject({ actualAmount: 20000, cashFlowAmount: 20000, benefitAmount: 500, eligibleSpendAmount: 20000 });
    expect(seoulMonth(source.transactions[2].occurred_at)).toBe("2026-01");
    expect(source).toEqual(original);
    const tied = { ...source, transactions: [source.transactions[0], { ...source.transactions[1], occurred_at: "2026-01-31T15:00:00.123456Z" }] };
    expect(replayLedger(tied, "2026-02").transactions.map(row => [row.id, row.benefits[0].appliedAmount])).toEqual([["later", 500], ["earlier", 0]]);
  });
  it.each(["2026-02-30T00:00:00.123456Z", "2026-02-01T24:00:00.123456Z", "2026-02-01T00:60:00.123456Z", "2026-02-01T00:00:60.123456Z", "2026-02-01T00:00:00.123456+09:60", "2026-02-01T00:00:00.1234567Z", "0000-02-01T00:00:00.123456Z"])("keeps invalid timestamp %s unknown instead of rolling into a valid date", async (at) => {
    const { seoulMonth } = await import("./view-model");
    const result = replayLedger(inputs({ transactions: [transaction("bad", 10000, at)] }), "2026-02");
    expect(result.transactions[0]).toMatchObject({ day: null, month: null, reasons: expect.arrayContaining(["ordering_unknown"]) });
    expect(seoulMonth(at)).toBeNull();
  });
});

describe("final fix: cash is not an unverified card", () => {
  it("keeps ordinary cash known without hiding card policy uncertainty", async () => {
    const cash = { ...transaction("cash"), user_card_id: null, payment_method: "cash" as const };
    const source = inputs({ ruleVersions: [], transactions: [cash] });
    const { buildCardWorkspace } = await import("./view-model");
    const build = (snapshot: typeof source) => buildCardWorkspace(snapshot, "7", "2026-02", replayLedger(snapshot, "2026-02"));
    const workspace = build(source);
    expect(workspace.transactions[0].workspace).toMatchObject({ actualAmount: 10000, finalAmount: 10000, benefitAmount: 0, benefitDisplay: { complete: true }, eligibleSpendAmount: 0 });
    expect(workspace.transactions[0].workspace?.projection.reasons).toEqual([]);
    expect(workspace.totals).toMatchObject({ finalAmount: 10000, benefitAmount: 0, cashFlowAmount: 10000 });
    const mixed = build({ ...source, transactions: [cash, transaction("unverified")] });
    expect(mixed.transactions.find(row => row.id === "unverified")?.workspace?.benefitAmount).toBeNull();
    expect(mixed.totals.benefitAmount).toBeNull();
  });
  it.each(["refund", "legacy correction"])("retains cash %s uncertainty and original evidence", async (cause) => {
    const source = inputs({ transactions: [{ ...transaction("cash"), user_card_id: null, payment_method: "cash" }],
      adjustments: cause === "refund" ? [refund("cash", 1000)] : [],
      annotations: cause === "legacy correction" ? [annotation("cash", "0.25", "confirmed_benefit", { target_key: null, origin: "legacy_manual", review_status: "needs_review" })] : [] });
    const { buildCardWorkspace } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.transactions[0].workspace?.finalAmount).toBeNull();
    expect(workspace.transactions[0].workspace?.benefitAmount).toBeNull();
    expect(workspace.transactions[0].workspace?.projection.reasons).toContain(cause === "refund" ? "refund_policy_unknown" : "annotation_allocation_unknown");
    expect(workspace.inputs).toEqual(source);
  });
});

describe("shared v2 presentation values", () => {
  it("formats negative refund-month cash flow without losing its sign", async () => {
    const { formatWon } = await import("./view-model");
    expect(formatWon(-2000)).toBe("-2,000원");
    expect(formatWon("1.25")).toBe("1.25원");
  });
  it("never sums legacy benefit snapshots and keeps refund cash flow in its occurrence month", async () => {
    const source = inputs({ ruleVersions: [version("a", policy({ performanceScopes: [], benefits: [{ key: "base", benefitKind: "discount", reward: { kind: "percent", basisPoints: 1000, rounding: "floor" }, performance: { kind: "none" }, conditions: [], recognitionBasis: "gross", quotaKeys: [], transactionLimit: null }] }))], transactions: [transaction("one", 10000)], adjustments: [refund("one", 2000)] });
    const { buildCardWorkspace } = await import("./view-model");
    const feb = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    const march = buildCardWorkspace(source, "7", "2026-03", replayLedger(source, "2026-03"));
    expect(feb.totals.benefitAmount).toBe(800);
    expect(feb.totals.cashFlowAmount).toBe(10000);
    expect(march.totals.cashFlowAmount).toBe(-2000);
    expect(feb.transactions[0].benefit_amount).toBe(99999);
    expect(feb.transactions[0].workspace?.benefitAmount).toBe(800);
  });
  it("uses the same preserved payment principal as replay rather than the legacy display amount", async () => {
    const original = { ...transaction("legacy"), origin: "legacy" as const, amount: "12000", actual_amount: "10000" };
    const source = inputs({ transactions: [original] });
    const { buildCardWorkspace } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.transactions[0].workspace?.actualAmount).toBe(10000);
    expect(workspace.totals.actualAmount).toBe(10000);
    expect(workspace.transactions[0].amount).toBe("12000");
  });
  it.each(["policy gap", "unallocated benefit"])("keeps %s unknown for the relevant card and month only", async (cause) => {
    const rules = policy({ performanceScopes: [], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, reward: { kind: "fixed", amount: 100 } }] });
    const note = annotation("one", "0.125", "benefit_eligible", { origin: "legacy_manual", target_key: null, review_status: "needs_review" });
    const source = inputs({ cards: [card("a"), card("b")], ruleVersions: [version("a", rules, cause === "policy gap" ? { effective_from: "2026-02-15" } : {}), version("b", rules)], transactions: [transaction("one", 1000), transaction("other", 1000, "2026-02-02T02:00:00Z", "b")], annotations: cause === "unallocated benefit" ? [note] : [] });
    const { buildCardWorkspace } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.transactions.find(row => row.id === "one")?.workspace?.benefitAmount).toBeNull();
    expect(workspace.totals.benefitAmount).toBeNull();
    expect(workspace.summaries.find(row => row.userCard.id === "a")?.benefitAmount).toBeNull();
    expect(workspace.summaries.find(row => row.userCard.id === "b")?.benefitAmount).toBe(100);
    const march = buildCardWorkspace(source, "7", "2026-03", replayLedger(source, "2026-03"));
    expect(march.summaries.find(row => row.userCard.id === "a")?.benefitAmount).toBe(0);
    expect(source.annotations[0]?.amount).toBe(cause === "unallocated benefit" ? "0.125" : undefined);
  });
  it.each(["missing scope data", "unallocated performance"])("does not poison independent benefits with %s", async (cause) => {
    const rules = policy({ benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, reward: { kind: "fixed", amount: 100 } }] });
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one", 1000)], monthInputs: [], annotations: cause === "unallocated performance" ? [annotation("one", "0.125", "performance", { target_key: null, scope_instance_key: null, origin: "legacy_manual", review_status: "needs_review" })] : [] });
    const { buildCardWorkspace } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.summaries[0].eligibleSpendAmount).toBeNull();
    expect(workspace.transactions[0].workspace?.benefitAmount).toBe(100);
    expect(workspace.totals.benefitAmount).toBe(100);
    expect(workspace.summaries[0].benefitAmount).toBe(100);
  });
  it("keeps a manual scope total and its mismatch warning rather than replacing it with a sum", async () => {
    const source = inputs({ transactions: [transaction("one")], monthInputs: [{ id: "manual", owner_id: "synthetic-owner", month: "2026-02-01", scope_kind: "performance", scope_key: "spend", scope_instance_key: "card:a:performance:spend", data_status: "manual_total", amount: "12345", version: "1", updated_at: "2026-02-01T00:00:00Z" }] });
    const { buildCardWorkspace } = await import("./view-model");
    const workspace = buildCardWorkspace(source, "7", "2026-02", replayLedger(source, "2026-02"));
    expect(workspace.summaries[0].eligibleSpendAmount).toBe(12345);
    expect(workspace.summaries[0].workspace?.performance[0].reasons).toContain("manual_total_mismatch");
    expect(workspace.inputs.monthInputs[0].amount).toBe("12345");
    const nextMonth = buildCardWorkspace(source, "7", "2026-03", replayLedger(source, "2026-03"));
    expect(nextMonth.summaries[0].manualTotalMismatches).toEqual([{ month: "2026-02", scopeKey: "spend", amount: 12345, ledgerAmount: 10000 }]);
  });
});
