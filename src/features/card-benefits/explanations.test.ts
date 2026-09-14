import { describe, expect, it } from "vitest";

import {
  buildBenefitExplanation,
  buildLegacyTransactionExplanation as buildTransactionExplanation,
} from "@/features/card-benefits/explanations";
import type { BenefitCalculationResult } from "@/features/card-benefits/types";
import type { TransactionRecord } from "@/features/transactions/types";

const result = (overrides: Partial<BenefitCalculationResult>): BenefitCalculationResult => ({
  source: "auto",
  rule: null,
  label: null,
  benefitAmount: 0,
  finalAmount: 12000,
  eligibleSpendAmount: 12000,
  isPerformanceEligible: true,
  performanceExclusionReason: null,
  calculationStatus: "calculated",
  calculationSnapshot: {},
  ...overrides,
});

const transaction = (overrides: Partial<TransactionRecord>): TransactionRecord => ({
  id: "transaction-1",
  owner_id: "owner-1",
  occurred_at: "2026-05-27T10:00:00Z",
  merchant_name: "스타벅스",
  merchant_normalized_name: "스타벅스",
  performance_exclusion_reason: null,
  calculation_status: "calculated",
  amount: 12000,
  actual_amount: 12000,
  benefit_label: "카페 5% 할인",
  benefit_amount: 600,
  final_amount: 11400,
  eligible_spend_amount: 11400,
  is_performance_eligible: true,
  payment_method: "credit_card",
  ledger_category: "카페",
  is_fixed_cost: false,
  user_card_id: "user-card-1",
  memo: null,
  transaction_benefit_applications: [
    {
      id: "application-1",
      transaction_id: "transaction-1",
      owner_id: "owner-1",
      user_card_id: "user-card-1",
      card_benefit_rule_id: "rule-1",
      label: "카페 5% 할인",
      source: "auto",
      benefit_amount: 600,
      eligible_spend_amount: 11400,
      calculation_snapshot: {
        ruleName: "카페 5% 할인",
        benefitKind: "discount",
        calculationMethod: "percent",
        rate: 0.05,
        benefitAmount: 600,
        finalAmount: 11400,
        eligibleSpendAmount: 11400,
      },
      created_at: "2026-05-27T10:00:00Z",
    },
  ],
  ...overrides,
});

describe("buildBenefitExplanation", () => {
  it("explains unsupported cards", () => {
    expect(buildBenefitExplanation(result({ calculationStatus: "unsupported_card" }))).toEqual([
      "이 카드는 아직 혜택 계산을 지원하지 않습니다.",
    ]);
  });

  it("explains performance exclusions before generic calculated copy", () => {
    expect(
      buildBenefitExplanation(
        result({
          calculationStatus: "calculated",
          performanceExclusionReason: "상품권 구매 제외",
          benefitAmount: 600,
          finalAmount: 11400,
        }),
      ),
    ).toEqual(["실적 제외: 상품권 구매 제외"]);
  });
});

describe("buildLegacyTransactionExplanation (history only)", () => {
  it("builds lines from transaction fields and saved calculation snapshot", () => {
    expect(buildTransactionExplanation(transaction({}))).toEqual([
      "카페 5% 할인 적용",
      "할인 5% · 혜택 600원",
      "최종 지출 11,400원",
      "실적 인정 11,400원",
    ]);
  });

  it("uses natural copy for manual overrides", () => {
    expect(
      buildTransactionExplanation(
        transaction({
          calculation_status: "manual_override",
          benefit_label: "직접 입력 혜택",
          benefit_amount: 1000,
          final_amount: 11000,
          eligible_spend_amount: 11000,
          transaction_benefit_applications: [
            {
              id: "application-1",
              transaction_id: "transaction-1",
              owner_id: "owner-1",
              user_card_id: "user-card-1",
              card_benefit_rule_id: null,
              label: "직접 입력 혜택",
              source: "manual",
              benefit_amount: 1000,
              eligible_spend_amount: 11000,
              calculation_snapshot: { source: "manual_transaction_fields" },
              created_at: "2026-05-27T10:00:00Z",
            },
          ],
        }),
      ),
    ).toEqual(["수동으로 입력한 혜택입니다.", "직접 입력 혜택 · 혜택 1,000원", "최종 지출 11,000원", "실적 인정 11,000원"]);
  });

  it("explains no matching rule and performance exclusion statuses", () => {
    expect(
      buildTransactionExplanation(
        transaction({
          calculation_status: "no_matching_rule",
          benefit_label: null,
          benefit_amount: 0,
          transaction_benefit_applications: null,
        }),
      ),
    ).toEqual(["적용 가능한 혜택이 없습니다.", "최종 지출 11,400원", "실적 인정 11,400원"]);

    expect(
      buildTransactionExplanation(
        transaction({
          performance_exclusion_reason: "세금/공과금 제외",
          is_performance_eligible: false,
          eligible_spend_amount: 0,
          transaction_benefit_applications: null,
        }),
      ),
    ).toContain("실적 제외: 세금/공과금 제외");
  });
});
