import { describe, expect, it } from "vitest";
import { card, inputs, monthData, policy, refund, transaction, version } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { cardsHref, ledgerHref, parseCardsQuery, performanceGeometry, selectWorkspaceActivity, workspaceCardPolicy, workspacePerformanceScopes, workspaceQuotaGroups } from "./workspace-view";

const query = { month: "2026-02" as const, tab: "performance" as const, query: "", card: "", page: 1 };
function workspace(source = inputs()) { return buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02")); }
describe("card workspace navigation", () => {
  it("returns to the canonical ledger with the selected month, card and shared input anchor", () => {
    expect(ledgerHref("2026-02", true, "card/a")).toBe("/ledger?month=2026-02&card=card%2Fa#quick-entry");
    expect(ledgerHref("2028-02")).toBe("/ledger?month=2028-02");
  });
  it("validates months, duplicate values and tabs before selecting server data", () => {
    expect(parseCardsQuery({ month: "2026-13", tab: "unknown", page: "-1" }, "2026-02")).toEqual(query);
    expect(parseCardsQuery({ month: ["2026-01", "2026-02"], tab: ["benefits"], query: "  긴 이름  " }, "2026-02")).toEqual({ ...query, query: "긴 이름" });
    expect(parseCardsQuery({ month: "0000-01", page: "Infinity" }, "2026-02")).toEqual(query);
  });
  it("preserves month/search/card on tab and paging links, resets page on filter changes", () => {
    const state = { ...query, query: "생활", card: "a", page: 3 };
    expect(cardsHref(state, { tab: "benefits" })).toBe("/cards?month=2026-02&tab=benefits&query=%EC%83%9D%ED%99%9C&card=a");
    expect(cardsHref(state, { page: 2 })).toContain("month=2026-02&tab=performance&query=%EC%83%9D%ED%99%9C&card=a&page=2");
    expect(parseCardsQuery({ month: "2026-01", tab: "transactions", page: "2" }, "2026-02")).toMatchObject({ month: "2026-01", tab: "transactions", page: 2 });
  });
});
describe("stage geometry, not a misleading linear currency axis", () => {
  const tiers = [{ key: "one", minimumSpend: 200000 }, { key: "two", minimumSpend: 500000 }, { key: "three", minimumSpend: 1100000 }];
  it.each([[0, 0], [100000, 100 / 6], [200000, 100 / 3], [350000, 50], [800000, 250 / 3], [1200000, 100]])("places %s at the hand-derived step position", (amount, position) => {
    expect(performanceGeometry(tiers, amount)?.fill).toBeCloseTo(position);
    expect(performanceGeometry(tiers, amount)?.marks.map(mark => mark.position)).toEqual([100 / 3, 200 / 3, 100]);
  });
  it("does not invent geometry for missing, unordered, empty or nonfinite inputs", () => {
    expect(performanceGeometry(tiers, null)).toBeNull();
    expect(performanceGeometry([], 0)).toBeNull();
    expect(performanceGeometry([...tiers].reverse(), 100)).toBeNull();
    expect(performanceGeometry(tiers, NaN)).toBeNull();
  });
  it("supports a zero threshold without dividing by zero", () => {
    expect(performanceGeometry([{ key: "free", minimumSpend: 0 }], 0)).toMatchObject({ fill: 100, marks: [{ reached: true }] });
  });
});
describe("final fix: downstream exclusion and chronology", () => {
  it("does not let an excluded historical date introduce a conflicting performance definition", () => {
    const later = policy(); later.performanceScopes[0].tiers = [{ key: "late", minimumSpend: 500000 }];
    const source = inputs({ ruleVersions: [version("a", policy(), { effective_until: "2026-02-15" }), version("a", later, { id: "late", version_order: 2, effective_from: "2026-02-15" })],
      transactions: [{ ...transaction("wrong"), input_excluded: true }, transaction("normal", 10000, "2026-02-20T00:00:00Z")] });
    const w = workspace(source);
    expect(workspacePerformanceScopes(w, w.summaries[0])[0].metadata?.definition.tiers).toEqual([{ key: "late", minimumSpend: 500000 }]);
  });
  it("does not list quota services selected only by excluded transactions", () => {
    const late = policy({ performanceScopes: [], quotas: [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["pool"] }] });
    const early = structuredClone(late); early.benefits[0].key = "excluded-only";
    const source = inputs({ ruleVersions: [version("a", early, { effective_until: "2026-02-15" }), version("a", late, { id: "late", version_order: 2, effective_from: "2026-02-15" })],
      transactions: [{ ...transaction("wrong"), input_excluded: true }, transaction("normal", 10000, "2026-02-20T00:00:00Z")] });
    expect(workspaceQuotaGroups(workspace(source))[0].services).toEqual(["base"]);
  });
  it("sorts purchase and refund activity by exact instants, not offset or fractional string spelling", () => {
    const source = inputs({ transactions: [transaction("earlier", 10000, "2026-02-01T00:00:00.123455+09:00", "a", 99), transaction("later", 10000, "2026-01-31T15:00:00.123456Z", "a", 1)],
      adjustments: [refund("earlier", 1000, "2026-01-31T15:00:00.123457Z")] });
    expect(selectWorkspaceActivity(workspace(source), query).rows.map(row => row.id)).toEqual(["refund-earlier", "later", "earlier"]);
  });
});

describe("full-month activity and safe display projections", () => {
  it("paginates presentation only, preserving actual principal and month-wide totals over 50 rows", () => {
    const rows = Array.from({ length: 65 }, (_, index) => ({ ...transaction(`row-${index}`, 1000, "2026-02-02T01:00:00Z", "a", index + 1), amount: 9999 }));
    const view = selectWorkspaceActivity(workspace(inputs({ transactions: rows })), { ...query, tab: "transactions", page: 2 });
    expect(view.totalCount).toBe(65);
    expect(view.actualAmount).toBe(65000);
    expect(view.rows).toHaveLength(15);
    expect(view.pageCount).toBe(2);
  });
  it("includes selected-month refunds of older transactions without moving their principal", () => {
    const source = inputs({ transactions: [transaction("old", 9000, "2026-01-05T00:00:00Z"), transaction("new", 1000)], adjustments: [refund("old", 3000, "2026-02-05T00:00:00Z")] });
    const activity = selectWorkspaceActivity(workspace(source), { ...query, tab: "transactions" });
    expect(activity.actualAmount).toBe(1000);
    expect(activity.refundAmount).toBe(3000);
    expect(activity.cashFlowAmount).toBe(-2000);
    expect(activity.rows.map(row => row.kind)).toContain("refund");
  });
  it("does not expose nonmatching cards or excluded entries under filters", () => {
    const source = inputs({ cards: [card("a"), card("b")], transactions: [transaction("a"), transaction("b", 9000, undefined, "b"), { ...transaction("excluded"), input_excluded: true }] });
    const activity = selectWorkspaceActivity(workspace(source), { ...query, card: "b", query: "no match" });
    expect(activity.rows).toEqual([]);
    expect(activity.actualAmount).toBe(0);
  });
  it("never promotes an unpublished or period-unverified policy into a tier display", () => {
    const source = inputs({ ruleVersions: [version("a", policy(), { publication_status: "draft", effective_from: null })] });
    const view = workspace(source);
    expect(workspaceCardPolicy(view, view.summaries[0])).toBeNull();
  });
  it("does not fall back by scope key when an instance cannot be identified", () => {
    const view = workspace();
    const summary = view.summaries[0];
    const original = summary.workspace!.performance[0];
    const scoped = { ...summary, workspace: { ...summary.workspace!, performance: [{ ...original, scopeInstanceKey: "unidentified-instance" }, original] } };
    const result = workspacePerformanceScopes(view, scoped);
    expect(result[0].metadata).toBeNull();
    expect(result[1].metadata?.definition.tiers).toEqual(policy().performanceScopes[0].tiers);
  });
  it("retains a quota used earlier in the month after its rule version is replaced", () => {
    const rules = policy({ performanceScopes: [], quotas: [{ key: "early", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 1000 } }], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["early"] }] });
    const source = inputs({ ruleVersions: [version("a", rules, { effective_until: "2026-02-15" }), version("a", policy({ quotas: [], benefits: [] }), { id: "v-later", version_order: 2, effective_from: "2026-02-15" })], transactions: [transaction("early", 1000)] });
    const groups = workspaceQuotaGroups(workspace(source));
    expect(groups).toHaveLength(1);
    expect(groups[0].cardIds).toEqual(["a"]);
    expect(groups[0].services).toEqual(["base"]);
  });
  it("groups the same quota once across two services, with unit and consumption preserved", () => {
    const base = policy().benefits[0];
    const rules = policy({ performanceScopes: [], quotas: [{ key: "coffee", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 10000 } }], benefits: [
      { ...base, key: "cafe", performance: { kind: "none" }, conditions: [{ kind: "category", values: ["cafe"] }], quotaKeys: ["coffee"] },
      { ...base, key: "bakery", performance: { kind: "none" }, conditions: [{ kind: "category", values: ["bakery"] }], quotaKeys: ["coffee"] },
    ] });
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [{ ...transaction("coffee", 1000), ledger_category: "cafe" }], monthInputs: [monthData("2026-02", "quota", "coffee")] });
    const groups = workspaceQuotaGroups(workspace(source));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ services: ["cafe", "bakery"], shared: true, quota: { remaining: 9950, consumption: "benefit_amount", unit: { kind: "won" } } });
  });
});
