import { describe, expect, it } from "vitest";
import { annotation, card, inputs, membership, monthData, policy, transaction, version } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "./view-model";
import { transactionEditorContext, cardInputOptions } from "./input-options";

const workspace = (source: ReturnType<typeof inputs>) => buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
describe("final fix: quota input identity", () => {
  function shared() {
    const rules = policy(); rules.benefits[0].performance = { kind: "none" }; rules.benefits[0].quotaKeys = ["pool"];
    rules.quotas = [{ key: "pool", sharing: { kind: "shared", contributorSlots: ["self", "partner"] }, limit: { kind: "fixed", amount: 500 } }];
    return inputs({ cards: [card("a"), card("b")], ruleVersions: [version("a", rules), version("b", rules)], transactions: [transaction("one")],
      memberships: [membership("a", "b", "quota", "pool", "shared-pool"), membership("b", "a", "quota", "pool", "shared-pool")], monthInputs: [] });
  }
  it("exposes one shared original pool, not independent remaining values per card or service", () => {
    const source = shared(); const original = { ...monthData("2026-02", "quota", "pool", { status: "remaining", amount: "0.125" }, "shared-pool"), version: "7" };
    const w = workspace({ ...source, monthInputs: [original, { ...monthData("2026-02", "quota", "pool", { status: "remaining", amount: 300 }, "shared-pool"), id: "foreign", owner_id: "other-owner" }] });
    for (const summary of w.summaries) {
      const options = cardInputOptions(w, summary).quotas;
      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ month: "2026-02", instanceKey: "shared-pool", shared: true, editable: true });
      expect(options[0].existing).toBe(original);
      expect(options[0].quota.remaining).toBeNull();
    }
  });
  it("preserves duplicate original rows but offers no write for their conflicting identity", () => {
    const source = shared(); const original = monthData("2026-02", "quota", "pool", { status: "complete" }, "shared-pool");
    const w = workspace({ ...source, monthInputs: [original, { ...monthData("2026-02", "quota", "pool", { status: "unknown" }, "shared-pool"), id: "conflict" }] });
    expect(cardInputOptions(w, w.summaries[0]).quotas[0]).toMatchObject({ editable: false, existing: null });
    expect(w.inputs.monthInputs).toHaveLength(2);
  });
  it("does not make a conflicting monthly quota definition editable", () => {
    const source = shared(); const changed = structuredClone(source.ruleVersions[0].policy_json) as ReturnType<typeof policy>;
    changed.quotas[0].limit = { kind: "fixed", amount: 1000 };
    const w = workspace({ ...source, ruleVersions: [...source.ruleVersions, version("a", changed, { id: "later", version_order: 2, effective_from: "2026-02-15" })] });
    expect(cardInputOptions(w, w.summaries[0]).quotas[0].editable).toBe(false);
  });
});

describe("daily quota completion input identity", () => {
  function daily() {
    const rules = policy({ performanceScopes: [], quotas: [{ key: "daily", period: "daily", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["daily"] }] });
    const later = structuredClone(rules); later.quotas[0].limit = { kind: "fixed", amount: 300 };
    return inputs({ ruleVersions: [version("a", rules, { effective_until: "2026-02-15" }), version("a", later, { id: "later", version_order: 2, effective_from: "2026-02-15" })], transactions: [transaction("early"), transaction("later", 10000, "2026-02-20T01:00:00Z")], monthInputs: [] });
  }
  it("groups daily pools into one month source without treating different daily caps as conflicts", () => {
    const source = daily(); const original = { ...monthData("2026-02", "quota", "daily", { status: "complete" }), version: "7" };
    const w = workspace({ ...source, monthInputs: [original] });
    const options = cardInputOptions(w, w.summaries[0]).quotas;
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ month: "2026-02", instanceKey: "card:a:quota:daily", existing: original, editable: true, supportsRemaining: false });
    expect(options[0].pools.map(pool => [pool.periodKey, pool.cap, pool.consumed, pool.remaining])).toEqual([["2026-02-02", 500, 500, 0], ["2026-02-20", 300, 300, 0]]);
    expect(options[0].quota.reasons).toEqual([]);
  });
  it("matches exact owner, month, key and instance and refuses duplicate daily originals", () => {
    const source = daily(); const original = monthData("2026-02", "quota", "daily", { status: "unknown" });
    const others = [
      { ...original, id: "other-owner", owner_id: "other-owner" },
      monthData("2026-01", "quota", "daily", { status: "complete" }),
      monthData("2026-02", "quota", "other-key", { status: "complete" }, original.scope_instance_key),
      monthData("2026-02", "quota", "daily", { status: "complete" }, "other-instance"),
    ];
    const exact = workspace({ ...source, monthInputs: [original, ...others] });
    expect(cardInputOptions(exact, exact.summaries[0]).quotas[0]).toMatchObject({ existing: original, originals: [original], editable: true });
    const duplicate = workspace({ ...source, monthInputs: [original, { ...original, id: "duplicate" }, ...others] });
    expect(cardInputOptions(duplicate, duplicate.summaries[0]).quotas[0]).toMatchObject({ existing: null, originals: [original, { ...original, id: "duplicate" }], editable: false });
    expect(duplicate.inputs.monthInputs).toHaveLength(6);
  });
  it("preserves unsupported daily opening decimals and their review state without selecting complete", () => {
    const source = daily(); const original = { ...monthData("2026-02", "quota", "daily", { status: "remaining", amount: "0.125" }), version: "7" };
    const w = workspace({ ...source, monthInputs: [original] });
    const option = cardInputOptions(w, w.summaries[0]).quotas[0];
    expect(option).toMatchObject({ existing: original, supportsRemaining: false, editable: true, quota: { reasons: expect.arrayContaining(["quota_unknown"]) } });
    expect(w.inputs.monthInputs).toEqual([original]);
    expect(option.pools.map(pool => pool.remaining)).toEqual([null, null]);
  });
  it("shares one month original across cards, services and days while retaining real binding conflicts", () => {
    const rules = policy({ performanceScopes: [], quotas: [{ key: "daily", period: "daily", sharing: { kind: "shared", contributorSlots: ["self", "partner"] }, limit: { kind: "fixed", amount: 500 } }], benefits: ["cafe", "shop"].map(key => ({ ...policy().benefits[0], key, performance: { kind: "none" as const }, conditions: [{ kind: "category" as const, values: [key] }], quotaKeys: ["daily"] })) });
    const original = monthData("2026-02", "quota", "daily", { status: "unknown" }, "daily-shared");
    const source = inputs({ cards: [card("a"), card("b")], ruleVersions: [version("a", rules), version("b", rules)], memberships: [membership("a", "b", "quota", "daily", "daily-shared"), membership("b", "a", "quota", "daily", "daily-shared")], transactions: [{ ...transaction("one"), ledger_category: "cafe" }, { ...transaction("two", 10000, "2026-02-03T01:00:00Z", "b"), ledger_category: "shop" }], monthInputs: [original] });
    const w = workspace(source);
    for (const summary of w.summaries) {
      const options = cardInputOptions(w, summary).quotas;
      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ existing: original, shared: true, editable: true, services: ["cafe", "shop"], supportsRemaining: false });
      expect(options[0].pools).toHaveLength(2);
    }
    const conflict = workspace({ ...source, memberships: source.memberships.slice(0, 1) });
    // A missing reciprocal binding makes the partner claim a different instance:
    // replay correctly labels that as a quota definition conflict, not an invalid row.
    expect(cardInputOptions(conflict, conflict.summaries[0]).quotas[0]).toMatchObject({ editable: false, quota: { reasons: expect.arrayContaining(["quota_definition_conflict"]) } });
    const invalidBinding = workspace({ ...source, memberships: [...source.memberships, { ...source.memberships[0], id: "duplicate-slot" }] });
    expect(cardInputOptions(invalidBinding, invalidBinding.summaries[0]).quotas[0]).toMatchObject({ editable: false, quota: { reasons: expect.arrayContaining(["scope_binding_unknown"]) } });
    const laterRules = structuredClone(rules); laterRules.quotas[0].limit = { kind: "fixed", amount: 300 };
    const laterConflict = workspace({ ...source,
      ruleVersions: [...source.ruleVersions, version("b", laterRules, { id: "later-b", version_order: 2, effective_from: "2026-02-03" })],
      memberships: [...source.memberships, membership("b", "a", "quota", "daily", "daily-shared", { id: "later-binding", rule_version_id: "later-b" })],
    });
    const option = cardInputOptions(laterConflict, laterConflict.summaries[0]).quotas[0];
    expect(option.pools[0].reasons).not.toContain("quota_definition_conflict");
    expect(option.pools[1].reasons).toContain("quota_definition_conflict");
    expect(option).toMatchObject({ editable: false, quota: { reasons: expect.arrayContaining(["quota_definition_conflict"]) } });
  });
});

describe("previous-month inputs required by the actual selected version", () => {
  it.each(["2026-01", "2026-02"] as const)("offers missing prior data when executable policy starts in February (replay starts %s)", startMonth => {
    const w = workspace(inputs({ startMonth, ruleVersions: [version("a", policy(), { effective_from: "2026-02-01" })], transactions: [transaction("one")], monthInputs: [] }));
    expect(w.transactions[0].workspace?.projection.benefits[0]).toMatchObject({ automaticAmount: null, reasons: expect.arrayContaining(["missing_performance"]) });
    const prior = cardInputOptions(w, w.summaries[0]).performance.filter(item => item.month === "2026-01");
    expect(prior).toHaveLength(1);
    expect(prior[0]).toMatchObject({ instanceKey: "card:a:performance:spend", existing: null, definition: { key: "spend" }, scope: { amount: null, ledgerAmount: null, source: null } });
  });
  it.each([["300000", 300000, 500], ["0", 0, 0], ["0.125", null, null]] as const)("preserves original prior total %s and uses the existing replay interpretation", (raw, total, benefit) => {
    const original = { ...monthData("2026-01", "performance", "spend", { status: "manual_total", amount: raw }), version: "7" };
    const w = workspace(inputs({ ruleVersions: [version("a", policy(), { effective_from: "2026-02-01" })], transactions: [transaction("one")], monthInputs: [original] }));
    const prior = cardInputOptions(w, w.summaries[0]).performance.find(item => item.month === "2026-01");
    expect(prior?.existing).toBe(original);
    expect(prior?.scope.amount).toBe(total);
    expect(prior?.scope.ledgerAmount).toBeNull();
    expect(w.transactions[0].workspace?.projection.benefits[0].automaticAmount).toBe(benefit);
    expect(original.amount).toBe(raw);
  });
  it("does not invent previous requirements from current-month or non-executable policies", () => {
    for (const rules of [policy({ benefits: [{ ...policy().benefits[0], performance: { kind: "none" } }] }), policy({ benefits: [{ ...policy().benefits[0], performance: { kind: "current_month", scopeKey: "spend", timing: "before_transaction" } }] })]) {
      const w = workspace(inputs({ ruleVersions: [version("a", rules, { effective_from: "2026-02-01" })], transactions: [transaction("one")], monthInputs: [] }));
      expect(cardInputOptions(w, w.summaries[0]).performance.map(item => item.month)).toEqual(["2026-02"]);
    }
    const w = workspace(inputs({ ruleVersions: [version("a", policy(), { effective_from: "2026-02-01", verification_status: "unverified" })], transactions: [transaction("one")], monthInputs: [] }));
    expect(cardInputOptions(w, w.summaries[0]).performance).toEqual([]);
  });
  it("keeps early and late scope instances separate without transitive contributor merging", () => {
    const early = policy({ performanceScopes: [{ ...policy().performanceScopes[0], contributorSlots: ["self", "partner"] }] });
    const late = policy({ performanceScopes: [{ ...early.performanceScopes[0], tiers: [{ key: "late", minimumSpend: 600000 }] }] });
    const original = monthData("2026-01", "performance", "spend", { status: "manual_total", amount: "300000" }, "early-instance");
    const w = workspace(inputs({ cards: [card("a"), card("b"), card("c")], ruleVersions: [
      version("a", early, { effective_from: "2026-02-01", effective_until: "2026-02-15" }),
      version("a", late, { id: "late", version_order: 2, effective_from: "2026-02-15" }),
      version("b", early, { effective_from: "2026-02-01" }),
    ], memberships: [membership("a", "b", "performance", "spend", "early-instance"), membership("a", "c", "performance", "spend", "late-instance", { id: "a-late", rule_version_id: "late" }), membership("b", "c", "performance", "spend", "b-instance")], transactions: [transaction("early"), transaction("late", 10000, "2026-02-20T01:00:00Z", "a", 2)], monthInputs: [original] }));
    const prior = cardInputOptions(w, w.summaries.find(row => row.userCard.id === "a")!).performance.filter(item => item.month === "2026-01");
    expect(prior.map(item => [item.instanceKey, item.definition.tiers[0].minimumSpend]).sort()).toEqual([["early-instance", 300000], ["late-instance", 600000]]);
    expect(prior.find(item => item.instanceKey === "early-instance")?.existing).toBe(original);
    expect(prior.find(item => item.instanceKey === "late-instance")?.existing).toBeNull();
    expect(w.transactions.map(row => row.workspace?.projection.benefits[0].automaticAmount)).toEqual([500, null]);
  });
  it("connects a prior scope required only by an applied tiered quota", () => {
    const rules = policy({ quotas: [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "base", amount: 1000 }, { tierKey: "plus", amount: 2000 }] } }], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["pool"] }] });
    const w = workspace(inputs({ ruleVersions: [version("a", rules, { effective_from: "2026-02-01" })], transactions: [transaction("one")], monthInputs: [] }));
    expect(cardInputOptions(w, w.summaries[0]).performance.find(item => item.month === "2026-01")?.instanceKey).toBe("card:a:performance:spend");
  });
  it("never replaces an unresolved existing previous-month scope with a current definition", () => {
    const w = workspace(inputs({ ruleVersions: [version("a", policy(), { effective_until: "2026-01-15" }), version("a", policy({ performanceScopes: [{ ...policy().performanceScopes[0], tiers: [{ key: "base", minimumSpend: 900000 }] }] }), { id: "late", version_order: 2, effective_from: "2026-01-15" })], transactions: [transaction("jan", 300000, "2026-01-02T00:00:00Z"), transaction("feb")], monthInputs: [monthData("2026-01")] }));
    expect(cardInputOptions(w, w.summaries[0]).performance.map(item => item.month)).toEqual(["2026-02"]);
  });
  it("does not bypass conflicting monthly definitions or duplicate original records", () => {
    const early = version("a", policy(), { effective_from: "2026-02-01", effective_until: "2026-02-15" });
    const late = version("a", policy({ performanceScopes: [{ ...policy().performanceScopes[0], tiers: [{ key: "base", minimumSpend: 900000 }] }] }), { id: "late", version_order: 2, effective_from: "2026-02-15" });
    const conflict = workspace(inputs({ ruleVersions: [early, late], transactions: [transaction("one")], monthInputs: [] }));
    expect(cardInputOptions(conflict, conflict.summaries[0]).performance).toEqual([]);
    const original = monthData("2026-01", "performance", "spend", { status: "manual_total", amount: "300000" });
    const duplicate = workspace(inputs({ ruleVersions: [version("a", policy(), { effective_from: "2026-02-01" })], monthInputs: [original, { ...monthData("2026-01", "performance", "spend", { status: "manual_total", amount: "900000" }), id: "duplicate" }] }));
    expect(cardInputOptions(duplicate, duplicate.summaries[0]).performance.filter(item => item.month === "2026-01")).toEqual([]);
    expect(duplicate.inputs.monthInputs.map(row => row.amount)).toEqual(["300000", "900000"]);
  });
});

describe("editor targets are exact replay inputs, not catalog suggestions", () => {
  it("uses the transaction-day service and keeps lost annotations verbatim", () => {
    const source = inputs({ transactions: [transaction("one")], annotations: [annotation("one", "0.125", "benefit_eligible", { target_key: "removed", origin: "legacy_manual", review_status: "needs_review" })], ruleVersions: [
      version("a", policy(), { effective_until: "2026-02-15" }),
      version("a", policy({ benefits: [{ ...policy().benefits[0], key: "late" }] }), { id: "late", version_order: 2, effective_from: "2026-02-15" }),
    ] });
    const w = workspace(source); const editor = transactionEditorContext(w, w.transactions[0]);
    expect(editor.targets.filter(t => t.kind === "benefit").map(t => [t.key, t.ruleVersionId])).toEqual([["base", "v-a"]]);
    expect(editor.annotations[0]).toMatchObject({ amount: "0.125", target_key: "removed", review_status: "needs_review" });
    expect(editor).toMatchObject({ ownerRevision: "37", transactionVersion: 1, refundableAmount: 10000 });
  });
  it("does not expose unverified or missing targets", () => {
    const w = workspace(inputs({ ruleVersions: [], transactions: [transaction("one")] }));
    expect(transactionEditorContext(w, w.transactions[0]).targets).toEqual([]);
    expect(cardInputOptions(w, w.summaries[0]).targets).toEqual([]);
  });
  it("bases refund ceiling on actual principal and active refunds, never legacy amount", () => {
    const source = inputs({ transactions: [{ ...transaction("one"), amount: "20000", actual_amount: "10000", origin: "legacy" }] });
    const w = workspace(source);
    expect(transactionEditorContext(w, w.transactions[0]).refundableAmount).toBe(10000);
  });
  it("preserves previous month data and does not replace early thresholds with late ones", () => {
    const source = inputs({ transactions: [transaction("one")], ruleVersions: [version("a", policy(), { effective_until: "2026-02-15" }), version("a", policy({ performanceScopes: [{ ...policy().performanceScopes[0], tiers: [{ key: "base", minimumSpend: 900000 }] }] }), { id: "late", version_order: 2, effective_from: "2026-02-15" })] });
    const w = workspace(source); const options = cardInputOptions(w, w.summaries[0]);
    expect(options.performance.find(item => item.month === "2026-01")?.definition.tiers[0].minimumSpend).toBe(300000);
    expect(options.targets).toEqual([]); // the reused February instance has conflicting definitions
  });
});
