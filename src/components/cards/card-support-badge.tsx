import type { CardBenefitSupportStatus } from "@/features/cards/types";
import { findPublicCardCandidate } from "@/features/card-benefits/catalog";

const supportLabels: Record<CardBenefitSupportStatus, string> = {
  full: "혜택 계산 지원",
  partial: "일부 혜택 지원",
  none: "계산 준비 중",
};

const supportClassNames: Record<CardBenefitSupportStatus, string> = {
  full: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200",
  none: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function CardSupportBadge({ status, card }: { status: CardBenefitSupportStatus; card?: { issuer: string; name: string } }) {
  if (card) {
    const candidate = findPublicCardCandidate(card);
    return (
      <span className={`inline-flex flex-wrap gap-x-2 rounded-full px-2 py-1 text-xs font-medium ring-1 ${supportClassNames[candidate ? "partial" : "none"]}`}>
        {candidate ? <><span>공식 설명서 확보</span><span>일부 조건 구현</span><span>적용 기간 미검증 · 자동 계산 대기</span></> : "상품·약관 검증 대기"}
      </span>
    );
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${supportClassNames[status]}`}>
      {supportLabels[status]}
    </span>
  );
}
