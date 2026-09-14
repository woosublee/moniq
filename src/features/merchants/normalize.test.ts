import { describe, expect, it } from "vitest";

import { normalizeMerchant } from "@/features/merchants/normalize";
import type { MerchantRuleRecord } from "@/features/merchants/types";

const rules: MerchantRuleRecord[] = [
  {
    id: "rule-starbucks",
    keyword: "스타벅스",
    normalized_merchant_name: "스타벅스",
    ledger_category: "카페",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rule-starbucks-en",
    keyword: "STARBUCKS",
    normalized_merchant_name: "스타벅스",
    ledger_category: "카페",
    priority: 20,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rule-coupang",
    keyword: "쿠팡",
    normalized_merchant_name: "쿠팡",
    ledger_category: "쇼핑",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("normalizeMerchant", () => {
  it("normalizes Korean merchant aliases", () => {
    expect(normalizeMerchant("스타벅스 강남R", rules)).toEqual({
      originalMerchantName: "스타벅스 강남R",
      normalizedMerchantName: "스타벅스",
      ledgerCategory: "카페",
      ruleId: "rule-starbucks",
    });
  });

  it("normalizes English aliases case-insensitively", () => {
    expect(normalizeMerchant("starbucks gangnam", rules)).toEqual({
      originalMerchantName: "starbucks gangnam",
      normalizedMerchantName: "스타벅스",
      ledgerCategory: "카페",
      ruleId: "rule-starbucks-en",
    });
  });

  it("falls back to the original name and 기타", () => {
    expect(normalizeMerchant("동네문구", rules)).toEqual({
      originalMerchantName: "동네문구",
      normalizedMerchantName: "동네문구",
      ledgerCategory: "기타",
      ruleId: null,
    });
  });
});
