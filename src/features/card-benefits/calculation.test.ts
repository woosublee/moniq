import { describe, expect, it } from "vitest";
import { applyBenefitCap, calculateBenefitAmount } from "./calculation";
import type { BenefitCalculationInput, CardBenefitRuleRecord } from "./types";

const rule: CardBenefitRuleRecord = {
  id: "rate", card_id: "synthetic", name: "Synthetic rate", benefit_kind: "discount",
  calculation_method: "percent", rate: "0.29", fixed_amount: null, min_payment_amount: 0,
  max_benefit_amount: null, cap_period: "none", match_merchant_keywords: [],
  match_ledger_categories: [], exclude_merchant_keywords: [], exclude_ledger_categories: [],
  requires_performance: false, priority: 1, starts_on: null, ends_on: null,
  is_active: true, condition_json: {}, created_at: "2026-01-01T00:00:00Z",
};
const input: BenefitCalculationInput = {
  occurredAt: "2026-01-02T00:00:00Z", merchantName: "Synthetic", actualAmount: 100,
  benefitAmount: 0, benefitLabel: "", finalAmount: 100, paymentMethod: "credit_card",
  ledgerCategory: "", isPerformanceEligible: true, userCardId: "a",
};

describe("shared reward arithmetic", () => {
  it("does not lose one won to floating point multiplication", () => {
    expect(calculateBenefitAmount(input, rule)).toBe(29);
  });
  it("treats a specified zero cap as exhausted, not unlimited", () => {
    expect(applyBenefitCap(1000, { ...rule, cap_period: "transaction", max_benefit_amount: 0 }, new Map())).toBe(0);
    expect(applyBenefitCap(1000, { ...rule, cap_period: "monthly", max_benefit_amount: 0 }, new Map())).toBe(0);
  });
});
