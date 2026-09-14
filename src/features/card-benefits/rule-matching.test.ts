import { describe, expect, it } from "vitest";

import { matchBenefitRules } from "@/features/card-benefits/rule-matching";
import type {
  BenefitCalculationInput,
  CardBenefitRuleRecord,
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

const makeRule = (overrides: Partial<CardBenefitRuleRecord>): CardBenefitRuleRecord => ({
  id: "rule-base",
  card_id: "card-1",
  name: "기본 혜택",
  benefit_kind: "discount",
  calculation_method: "percent",
  rate: 0.1,
  fixed_amount: null,
  min_payment_amount: 0,
  max_benefit_amount: null,
  cap_period: "none",
  match_merchant_keywords: [],
  match_ledger_categories: [],
  exclude_merchant_keywords: [],
  exclude_ledger_categories: [],
  requires_performance: false,
  priority: 100,
  starts_on: null,
  ends_on: null,
  is_active: true,
  condition_json: {},
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("matchBenefitRules", () => {
  it("matches by merchant keyword case-insensitively", () => {
    const rules = [
      makeRule({ id: "rule-starbucks", match_merchant_keywords: ["STARBUCKS", "스타벅스"] }),
      makeRule({ id: "rule-coupang", match_merchant_keywords: ["쿠팡"] }),
    ];

    expect(matchBenefitRules(baseInput, rules).map((rule) => rule.id)).toEqual(["rule-starbucks"]);
  });

  it("matches by ledger category", () => {
    const rules = [
      makeRule({ id: "rule-cafe", match_ledger_categories: ["카페"] }),
      makeRule({ id: "rule-shopping", match_ledger_categories: ["쇼핑"] }),
    ];

    expect(matchBenefitRules(baseInput, rules).map((rule) => rule.id)).toEqual(["rule-cafe"]);
  });

  it("requires the minimum payment amount", () => {
    const rules = [
      makeRule({ id: "rule-too-high", min_payment_amount: 20_000 }),
      makeRule({ id: "rule-met", min_payment_amount: 10_000 }),
    ];

    expect(matchBenefitRules(baseInput, rules).map((rule) => rule.id)).toEqual(["rule-met"]);
  });

  it("excludes matching ledger categories", () => {
    const rules = [
      makeRule({ id: "rule-excluded", exclude_ledger_categories: ["카페"] }),
      makeRule({ id: "rule-allowed", exclude_ledger_categories: ["쇼핑"] }),
    ];

    expect(matchBenefitRules(baseInput, rules).map((rule) => rule.id)).toEqual(["rule-allowed"]);
  });

  it("sorts matched rules by priority ascending", () => {
    const rules = [
      makeRule({ id: "rule-later", priority: 30 }),
      makeRule({ id: "rule-first", priority: 10 }),
      makeRule({ id: "rule-middle", priority: 20 }),
    ];

    expect(matchBenefitRules(baseInput, rules).map((rule) => rule.id)).toEqual([
      "rule-first",
      "rule-middle",
      "rule-later",
    ]);
  });
});
