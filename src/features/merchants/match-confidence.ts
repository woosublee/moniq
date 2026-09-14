import { normalizeMerchant } from "./normalize";
import type { MerchantRuleRecord } from "./types";
import type { MerchantMatch } from "@/features/card-benefits/engine-types";

export function matchMerchantConfidence(name: string, rules: readonly MerchantRuleRecord[]): MerchantMatch {
  const normalized = name.trim().toLowerCase();
  const active = rules.filter((rule) => rule.is_active && rule.keyword.trim());
  const exact = active.filter((rule) => [rule.keyword, rule.normalized_merchant_name].some((value) => value.trim().toLowerCase() === normalized));
  const candidates = exact.length ? exact : active.filter((rule) => normalized.includes(rule.keyword.trim().toLowerCase()));
  const names = [...new Set(candidates.map((rule) => rule.normalized_merchant_name))].sort();
  if (exact.length && names.length === 1 && new Set(exact.map((rule) => rule.ledger_category)).size === 1) {
    const result = normalizeMerchant(name, exact.map((rule) => ({ ...rule, keyword: name.trim() })));
    return { status: "exact", normalizedName: result.normalizedMerchantName, category: result.ledgerCategory, candidates: names };
  }
  return { status: candidates.length ? "ambiguous" : "unknown", normalizedName: name.trim(), category: null, candidates: names };
}
