export type MerchantRuleRecord = {
  id: string;
  keyword: string;
  normalized_merchant_name: string;
  ledger_category: string;
  priority: number;
  is_active: boolean;
  created_at: string;
};

export type MerchantNormalizationResult = {
  originalMerchantName: string;
  normalizedMerchantName: string;
  ledgerCategory: string;
  ruleId: string | null;
};
