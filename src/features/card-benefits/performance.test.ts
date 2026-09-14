import { describe, expect, it } from "vitest";

import { getPerformanceExclusionReason } from "@/features/card-benefits/performance";
import type {
  BenefitCalculationInput,
  CardPerformanceExclusionRuleRecord,
} from "@/features/card-benefits/types";

const baseInput: BenefitCalculationInput = {
  occurredAt: "2026-05-27T12:00:00Z",
  merchantName: "스타벅스 강남R",
  actualAmount: 12_000,
  benefitAmount: 0,
  benefitLabel: "",
  finalAmount: 12_000,
  paymentMethod: "credit_card",
  ledgerCategory: "카페",
  isPerformanceEligible: true,
  userCardId: "user-card-1",
};

const makeRule = (
  overrides: Partial<CardPerformanceExclusionRuleRecord>,
): CardPerformanceExclusionRuleRecord => ({
  id: "exclusion-base",
  card_id: "card-1",
  label: "실적 제외",
  match_merchant_keywords: [],
  match_ledger_categories: [],
  exclude_if_benefit_applied: false,
  priority: 100,
  starts_on: null,
  ends_on: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("getPerformanceExclusionReason", () => {
  it("returns the matching category exclusion label", () => {
    const rules = [makeRule({ id: "rule-category", label: "카페 실적 제외", match_ledger_categories: ["카페"] })];

    expect(getPerformanceExclusionReason({ input: baseInput, rules, benefitApplied: false })).toBe(
      "카페 실적 제외",
    );
  });

  it("returns the matching merchant keyword exclusion label", () => {
    const rules = [
      makeRule({ id: "rule-merchant", label: "스타벅스 실적 제외", match_merchant_keywords: ["STARBUCKS", "스타벅스"] }),
    ];

    expect(getPerformanceExclusionReason({ input: baseInput, rules, benefitApplied: false })).toBe(
      "스타벅스 실적 제외",
    );
  });

  it("applies benefit-applied exclusions only when a benefit was applied", () => {
    const rules = [
      makeRule({ id: "rule-benefit", label: "혜택 적용 건 실적 제외", exclude_if_benefit_applied: true }),
    ];

    expect(getPerformanceExclusionReason({ input: baseInput, rules, benefitApplied: false })).toBeNull();
    expect(getPerformanceExclusionReason({ input: baseInput, rules, benefitApplied: true })).toBe(
      "혜택 적용 건 실적 제외",
    );
  });

  it("ignores inactive rules", () => {
    const rules = [
      makeRule({ id: "rule-inactive", label: "비활성 제외", match_ledger_categories: ["카페"], is_active: false }),
    ];

    expect(getPerformanceExclusionReason({ input: baseInput, rules, benefitApplied: false })).toBeNull();
  });
});
