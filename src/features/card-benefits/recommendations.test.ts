import { describe, expect, it } from "vitest";

import {
  getClosestPerformanceInsight,
  getTopBenefitInsight,
} from "@/features/card-benefits/recommendations";
import type { CardPerformanceSummary } from "@/features/card-benefits/types";

const summary = (overrides: Partial<CardPerformanceSummary>): CardPerformanceSummary => ({
  userCard: {
    id: "user-card-1",
    owner_id: "owner-1",
    alias: null,
    is_default: false,
    created_at: "2026-05-27T10:00:00Z",
    card_id: "card-1",
    card: {
      id: "card-1",
      issuer: "신한카드",
      name: "딥드림",
      card_type: "credit_card",
      network: null,
      annual_fee: null,
      image_url: null,
      benefit_support_status: "full",
      benefit_summary: null,
      searchable_text: "신한카드 딥드림",
      created_at: "2026-05-27T10:00:00Z",
    },
  },
  requirement: null,
  eligibleSpendAmount: 0,
  requiredSpendAmount: 300000,
  remainingSpendAmount: 0,
  benefitAmount: 0,
  status: "no_requirement",
  ...overrides,
});

describe("getClosestPerformanceInsight", () => {
  it("returns the closest performance insight", () => {
    expect(
      getClosestPerformanceInsight([
        summary({
          userCard: {
            ...summary({}).userCard,
            id: "user-card-1",
            card: { ...summary({}).userCard.card, name: "먼 카드" },
          },
          status: "unmet",
          remainingSpendAmount: 50000,
        }),
        summary({
          userCard: {
            ...summary({}).userCard,
            id: "user-card-2",
            card: { ...summary({}).userCard.card, name: "가까운 카드" },
          },
          status: "unmet",
          remainingSpendAmount: 12000,
        }),
      ]),
    ).toBe("가까운 카드은 12,000원만 더 쓰면 실적 조건을 충족해요.");
  });

  it("returns null when there is no unmet card", () => {
    expect(
      getClosestPerformanceInsight([
        summary({ status: "met", remainingSpendAmount: 0 }),
        summary({ status: "no_requirement", remainingSpendAmount: 0 }),
      ]),
    ).toBeNull();
  });
});

describe("getTopBenefitInsight", () => {
  it("returns the top benefit insight", () => {
    expect(
      getTopBenefitInsight([
        summary({
          userCard: {
            ...summary({}).userCard,
            id: "user-card-1",
            card: { ...summary({}).userCard.card, name: "작은혜택 카드" },
          },
          benefitAmount: 1000,
        }),
        summary({
          userCard: {
            ...summary({}).userCard,
            id: "user-card-2",
            card: { ...summary({}).userCard.card, name: "큰혜택 카드" },
          },
          benefitAmount: 3000,
        }),
      ]),
    ).toBe("이번 달 가장 많은 혜택을 받은 카드는 큰혜택 카드입니다.");
  });

  it("returns null when there is no benefit", () => {
    expect(getTopBenefitInsight([summary({ benefitAmount: 0 })])).toBeNull();
  });
});
