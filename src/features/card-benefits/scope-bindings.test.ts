import { expect, it } from "vitest";
import { resolveScopeBinding, compatibleQuotaDefinitions, selectRuleVersion } from "./scope-bindings";
import { membership, policy, version } from "./replay.fixtures";

it("keeps directed contributors non-transitive and deduplicated", () => {
  const result = resolveScopeBinding("synthetic-owner", "a", "v-a", "performance", "spend", ["self", "partner", "second"], "2026-02", [membership(), membership("b", "c"), membership("a", "b", "performance", "spend", undefined, { id: "second", contributor_slot: "second" })]);
  expect(result).toMatchObject({ instanceKey: "card:a:performance:spend", contributors: ["a", "b"], reasons: [] });
});
it("marks conflicting instance bindings unknown rather than unioning them", () => {
  const result = resolveScopeBinding("synthetic-owner", "a", "v-a", "quota", "pool", ["self", "partner", "second"], "2026-02", [membership("a", "b", "quota", "pool", "shared"), membership("a", "c", "quota", "pool", "other", { contributor_slot: "second" })]);
  expect(result.reasons).toContain("scope_binding_unknown");
});
it("selects the highest published verified covering version on a Seoul day", () => {
  expect(selectRuleVersion("product-a", "2026-02-16", [version(), version("a", policy(), { id: "v2", version_order: 2, effective_from: "2026-02-15" }), version("a", policy(), { id: "draft", version_order: 3, publication_status: "draft" })])?.id).toBe("v2");
});
it("preserves stable pool definitions across versions but rejects changed cap semantics", () => {
  const quota = { key: "pool", sharing: { kind: "independent" as const }, limit: { kind: "fixed" as const, amount: 1000 } };
  expect(compatibleQuotaDefinitions(quota, { ...quota, period: "monthly", consumption: { kind: "benefit_amount", unit: { kind: "won" } } })).toBe(true);
  expect(compatibleQuotaDefinitions(quota, { ...quota, limit: { kind: "fixed", amount: 2000 } })).toBe(false);
  expect(compatibleQuotaDefinitions(quota, { ...quota, consumption: { kind: "count" } })).toBe(false);
});
