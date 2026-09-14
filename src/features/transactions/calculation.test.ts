import { describe, expect, it } from "vitest";

import { calculateTransaction } from "@/features/transactions/calculation";
import type {
  BenefitCalculationContext,
  CardBenefitRuleRecord,
  CardPerformanceExclusionRuleRecord,
} from "@/features/card-benefits/types";
import type { UserCardRecord } from "@/features/cards/types";
import type { MerchantRuleRecord } from "@/features/merchants/types";
import type { TransactionInput } from "@/features/transactions/types";

const baseInput: TransactionInput = {
  occurredAt: "2026-05-27T12:00:00Z",
  timezoneOffset: 0,
  merchantName: "스타벅스 강남R점",
  amount: 12_000,
  actualAmount: 12_000,
  benefitLabel: "",
  benefitAmount: 0,
  finalAmount: 12_000,
  paymentMethod: "credit_card",
  userCardId: "user-card-1",
  isPerformanceEligible: true,
  ledgerCategory: "",
  isFixedCost: false,
  memo: "",
};

const supportedUserCard: UserCardRecord = {
  id: "user-card-1",
  owner_id: "owner-1",
  card_id: "card-1",
  alias: "테스트 카드",
  is_default: false,
  card: {
    id: "card-1",
    issuer: "테스트카드",
    name: "혜택 카드",
    card_type: "credit_card",
    benefit_support_status: "full",
    benefit_summary: null,
    network: null,
    searchable_text: "테스트카드 혜택 카드",
    annual_fee: 0,
    image_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  created_at: "2026-01-01T00:00:00Z",
};

const unsupportedUserCard = {
  ...supportedUserCard,
  card: {
    ...supportedUserCard.card,
    benefit_support_status: "none",
  },
} as UserCardRecord;

const makeBenefitRule = (
  overrides: Partial<CardBenefitRuleRecord> = {},
): CardBenefitRuleRecord => ({
  id: "rule-cafe",
  card_id: "card-1",
  name: "카페 5% 할인",
  benefit_kind: "discount",
  calculation_method: "percent",
  rate: 0.05,
  fixed_amount: null,
  min_payment_amount: 0,
  max_benefit_amount: null,
  cap_period: "none",
  match_merchant_keywords: [],
  match_ledger_categories: ["카페"],
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

const makePerformanceExclusionRule = (
  overrides: Partial<CardPerformanceExclusionRuleRecord> = {},
): CardPerformanceExclusionRuleRecord => ({
  id: "exclusion-cafe",
  card_id: "card-1",
  label: "카페 실적 제외",
  match_merchant_keywords: [],
  match_ledger_categories: ["카페"],
  exclude_if_benefit_applied: false,
  priority: 100,
  starts_on: null,
  ends_on: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeContext = (
  overrides: Partial<BenefitCalculationContext> = {},
): BenefitCalculationContext => ({
  userCard: supportedUserCard,
  rules: [makeBenefitRule()],
  performanceExclusionRules: [],
  requirement: null,
  monthlyRuleUsage: new Map<string, number>(),
  isPerformanceRequirementMet: true,
  ...overrides,
});

const merchantRules: MerchantRuleRecord[] = [
  {
    id: "merchant-starbucks",
    keyword: "스타벅스",
    normalized_merchant_name: "스타벅스",
    ledger_category: "카페",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("calculateTransaction", () => {
  it("calculates a supported card transaction with a matching rule", () => {
    const result = calculateTransaction(baseInput, makeContext(), merchantRules);

    expect(result).toMatchObject({
      merchantNormalizedName: "스타벅스",
      ledgerCategory: "카페",
      label: "카페 5% 할인",
      benefitAmount: 600,
      finalAmount: 11400,
      eligibleSpendAmount: 11400,
      calculationStatus: "calculated",
    });
  });

  it("marks unsupported cards as unsupported_card", () => {
    const result = calculateTransaction(
      baseInput,
      makeContext({ userCard: unsupportedUserCard }),
      merchantRules,
    );

    expect(result).toMatchObject({
      merchantNormalizedName: "스타벅스",
      ledgerCategory: "카페",
      benefitAmount: 0,
      finalAmount: 12_000,
      eligibleSpendAmount: 12_000,
      calculationStatus: "unsupported_card",
    });
  });

  it("marks supported cards with no matching rule as no_matching_rule", () => {
    const result = calculateTransaction(
      baseInput,
      makeContext({ rules: [makeBenefitRule({ match_ledger_categories: ["쇼핑"] })] }),
      merchantRules,
    );

    expect(result).toMatchObject({
      merchantNormalizedName: "스타벅스",
      ledgerCategory: "카페",
      benefitAmount: 0,
      finalAmount: 12_000,
      eligibleSpendAmount: 12_000,
      calculationStatus: "no_matching_rule",
    });
  });

  it("keeps calculated status while excluding performance spend", () => {
    const result = calculateTransaction(
      baseInput,
      makeContext({ performanceExclusionRules: [makePerformanceExclusionRule()] }),
      merchantRules,
    );

    expect(result).toMatchObject({
      merchantNormalizedName: "스타벅스",
      ledgerCategory: "카페",
      benefitAmount: 600,
      finalAmount: 11_400,
      eligibleSpendAmount: 0,
      performanceExclusionReason: "카페 실적 제외",
      calculationStatus: "calculated",
    });
  });
});
