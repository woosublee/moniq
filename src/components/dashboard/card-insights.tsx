import {
  getClosestPerformanceInsight,
  getTopBenefitInsight,
} from "@/features/card-benefits/recommendations";
import type { CardPerformanceSummary } from "@/features/card-benefits/types";

import { formatWon } from "@/lib/card-workspace/view-model";

export function CardInsights({ summaries }: { summaries: CardPerformanceSummary[] }) {
  const closestPerformanceInsight = getClosestPerformanceInsight(summaries);
  const topBenefitInsight = getTopBenefitInsight(summaries);
  const remainingSpendCards = summaries
    .filter((summary) => summary.remainingSpendAmount !== null && summary.remainingSpendAmount > 0)
    .sort((a, b) => (a.remainingSpendAmount ?? Infinity) - (b.remainingSpendAmount ?? Infinity));

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
        카드를 등록하면 카드별 실적과 혜택 인사이트를 확인할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <InsightPanel
        label="실적에 가장 가까운 카드"
        value={closestPerformanceInsight ?? "달성 대기 카드 없음"}
        caption={
          closestPerformanceInsight
            ? "확인된 실적 조건 기준입니다. 미확인 값은 검토해 주세요."
            : "남은 실적 조건이 있는 카드가 없습니다."
        }
      />
      <InsightPanel
        label="혜택이 가장 큰 카드"
        value={topBenefitInsight ?? "혜택 기록 없음"}
        caption={
          topBenefitInsight
            ? "원화 혜택 기준입니다. 포인트/마일은 별도입니다."
            : "혜택이 적용된 거래가 아직 없습니다."
        }
        accent={Boolean(topBenefitInsight)}
      />
      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-500">남은 실적 카드</p>
        {remainingSpendCards.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {summaries.some(summary => summary.remainingSpendAmount === null) ? "실적 확인 필요" : "남은 실적 금액이 있는 카드가 없습니다."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {remainingSpendCards.slice(0, 3).map((summary) => (
              <div key={summary.userCard.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-slate-700">
                  {getCardName(summary)}
                </span>
                <span className="shrink-0 text-slate-500">
                  {formatWon(summary.remainingSpendAmount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

function InsightPanel({
  label,
  value,
  caption,
  accent = false,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <article
      className={
        accent
          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          : "rounded-xl border border-slate-200 bg-slate-50 p-4"
      }
    >
      <p className={accent ? "text-sm font-medium text-emerald-700" : "text-sm text-slate-500"}>
        {label}
      </p>
      <p
        className={
          accent
            ? "mt-2 truncate text-lg font-semibold text-emerald-900"
            : "mt-2 truncate text-lg font-semibold text-slate-950"
        }
      >
        {value}
      </p>
      <p className={accent ? "mt-1 text-sm text-emerald-700" : "mt-1 text-sm text-slate-500"}>
        {caption}
      </p>
    </article>
  );
}

function getCardName(summary: CardPerformanceSummary) {
  return `${summary.userCard.card.issuer} ${summary.userCard.card.name}${summary.userCard.alias ? ` (${summary.userCard.alias})` : ""}`;
}
