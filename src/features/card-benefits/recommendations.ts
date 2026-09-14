import type { CardPerformanceSummary } from "@/features/card-benefits/types";

export function getClosestPerformanceInsight(summaries: CardPerformanceSummary[]) {
  if (summaries.some(summary => summary.remainingSpendAmount === null)) return "실적 확인 필요";
  const candidate = summaries
    .filter((summary) => summary.status === "unmet" && summary.remainingSpendAmount !== null && summary.remainingSpendAmount > 0)
    .sort((a, b) => (a.remainingSpendAmount ?? Infinity) - (b.remainingSpendAmount ?? Infinity))[0];

  if (!candidate) {
    return null;
  }

  return `${candidate.userCard.card.name}은 ${new Intl.NumberFormat("ko-KR").format(candidate.remainingSpendAmount!)}원만 더 쓰면 실적 조건을 충족해요.`;
}

export function getTopBenefitInsight(summaries: CardPerformanceSummary[]) {
  if (summaries.some(summary => summary.benefitAmount === null)) return "혜택 확인 필요";
  const candidate = summaries
    .filter((summary) => summary.benefitAmount !== null && summary.benefitAmount > 0)
    .sort((a, b) => (b.benefitAmount ?? 0) - (a.benefitAmount ?? 0))[0];

  if (!candidate) {
    return null;
  }

  return `이번 달 가장 많은 혜택을 받은 카드는 ${candidate.userCard.card.name}입니다.`;
}
