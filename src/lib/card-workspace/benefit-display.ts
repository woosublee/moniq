import type { ReplayBenefit, UnitTotal } from "@/features/card-benefits/engine-types";
import { unitKey } from "@/features/card-benefits/summaries";

/** Presentation of replay amounts, not a conversion to a common currency. */
export type BenefitDisplay = {
  complete: boolean;
  totals: (UnitTotal & { sources: ReplayBenefit["appliedSource"][] })[];
};

export function buildBenefitDisplay(totals: readonly UnitTotal[], benefits: readonly ReplayBenefit[], incomplete: boolean): BenefitDisplay {
  return {
    complete: !incomplete && totals.every(total => total.unit !== null && total.amount !== null),
    totals: totals.map(total => ({ ...total, sources: [...new Set(benefits.filter(benefit => unitKey(benefit.unit) === unitKey(total.unit)).map(benefit => benefit.appliedSource))].sort() })),
  };
}

const sourceLabels: Record<ReplayBenefit["appliedSource"], string> = {
  auto: "자동", estimated_override: "예상 보정", confirmed: "명시 확정",
};
const numberFormatter = new Intl.NumberFormat("ko-KR");
export function formatBenefitDisplay(display: BenefitDisplay): string {
  if (!display.totals.length) return display.complete ? "0원" : "확인 필요";
  const values = display.totals.map(({ unit, amount, sources }) => {
    const unitLabel = !unit ? "단위 확인 필요" : unit.kind === "won" ? "원" : `${unit.kind === "points" ? "포인트" : "마일"} (${unit.program})`;
    const value = amount === null || unit === null ? `확인 필요 (${unitLabel})` : `${numberFormatter.format(amount)}${unitLabel}`;
    const partial = !display.complete && amount !== null && unit !== null ? "알려진 부분 " : "";
    return `${partial}${value}${sources.length ? ` (${sources.map(source => sourceLabels[source]).join(" / ")})` : ""}`;
  });
  return `${display.complete ? "" : "합계 확인 필요 · "}${values.join(" · ")}`;
}
