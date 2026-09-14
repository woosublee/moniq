import { expect, it } from "vitest";
import { matchMerchantConfidence } from "./match-confidence";
import type { MerchantRuleRecord } from "./types";
const rules: MerchantRuleRecord[] = [
  { id: "one", keyword: "Cafe One", normalized_merchant_name: "Cafe One", ledger_category: "cafe", priority: 1, is_active: true, created_at: "2026-01-01" },
  { id: "two", keyword: "One", normalized_merchant_name: "Other One", ledger_category: "other", priority: 2, is_active: true, created_at: "2026-01-01" },
];
it("distinguishes exact aliases from substring suggestions and unknown names", () => {
  expect(matchMerchantConfidence("  CAFE ONE  ", rules)).toMatchObject({ status: "exact", normalizedName: "Cafe One", category: "cafe" });
  expect(matchMerchantConfidence("Cafe One mall", rules)).toMatchObject({ status: "ambiguous", category: null, candidates: ["Cafe One", "Other One"] });
  expect(matchMerchantConfidence("Unlisted", rules)).toMatchObject({ status: "unknown", normalizedName: "Unlisted", category: null });
});
it("does not choose a priority winner for conflicting exact aliases", () => {
  expect(matchMerchantConfidence("Cafe One", [...rules, { ...rules[1], keyword: "Cafe One" }]).status).toBe("ambiguous");
});
