import type {
  MerchantNormalizationResult,
  MerchantRuleRecord,
} from "@/features/merchants/types";

const normalizeText = (value: string) => value.trim().toLowerCase();

export function normalizeMerchant(
  merchantName: string,
  rules: MerchantRuleRecord[],
): MerchantNormalizationResult {
  const originalMerchantName = merchantName.trim();
  const normalizedInput = normalizeText(originalMerchantName);
  const matchedRule = rules
    .filter((rule) => rule.is_active)
    .sort((a, b) => a.priority - b.priority)
    .find((rule) => normalizedInput.includes(normalizeText(rule.keyword)));

  if (!matchedRule) {
    return {
      originalMerchantName,
      normalizedMerchantName: originalMerchantName,
      ledgerCategory: "기타",
      ruleId: null,
    };
  }

  return {
    originalMerchantName,
    normalizedMerchantName: matchedRule.normalized_merchant_name,
    ledgerCategory: matchedRule.ledger_category,
    ruleId: matchedRule.id,
  };
}
