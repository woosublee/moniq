"use client";

import { useId, useState } from "react";
import { performanceGeometry } from "@/features/cards/workspace-view";
import { formatWon } from "@/lib/card-workspace/view-model";

type Tier = { key: string; minimumSpend: number };
export function PerformanceTierProgress({ tiers, amount, targetKey, label }: { tiers: readonly Tier[]; amount: number | null; targetKey?: string | null; label: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const geometry = performanceGeometry(tiers, amount);
  if (!geometry || amount === null) return null;
  const targetIndex = tiers.findIndex(tier => tier.key === targetKey);
  const maximum = tiers[tiers.length - 1].minimumSpend;
  return <div className="tier-progress">
    <div className="tier-scroll">
      <div className="tier-plot" style={{ minWidth: `${Math.max(0, tiers.length * 44)}px` }}>
        {targetIndex >= 0 ? <span className={`tier-target${targetIndex === tiers.length - 1 ? " tier-target-end" : ""}`} style={{ left: `${(targetIndex + 1) * 100 / tiers.length}%` }}><span aria-hidden="true">⚑</span> 내 목표</span> : null}
        <div className="tier-track" role="meter" aria-label={`${label} · 단계형 실적`} aria-valuemin={0} aria-valuemax={Math.max(maximum, amount)} aria-valuenow={amount} aria-valuetext={`인정 실적 ${formatWon(amount)}, 최고 구간 ${formatWon(maximum)}. 구간별 간격은 동일하며 각 구간 안에서만 금액에 비례합니다.`} aria-describedby={`${id}-data`}>
          <span className="tier-fill" style={{ width: `${geometry.fill}%` }} />
        </div>
        {geometry.marks.map((mark, index) => <button key={mark.key} type="button" className={`tier-hit${mark.reached ? " reached" : ""}`} style={{ left: `${mark.position}%` }} aria-label={`${index + 1}구간 ${formatWon(mark.minimumSpend)}, ${mark.reached ? "달성" : "미달"}${targetKey === mark.key ? ", 내 목표" : ""}`} aria-describedby={active === index ? `${id}-tip` : undefined}
          onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} onKeyDown={event => { if (event.key === "Escape") setActive(null); }}><span>{index + 1}</span></button>)}
      </div>
    </div>
    {active !== null ? <div className="tier-tooltip" id={`${id}-tip`} role="tooltip"><strong>{formatWon(tiers[active].minimumSpend)}</strong> · {active + 1}구간 · {amount >= tiers[active].minimumSpend ? "달성" : "미달"}</div> : null}
    <details className="tier-data" id={`${id}-data`}>
      <summary>구간 기준 보기</summary>
      <p>구간별 간격은 동일합니다. 구간 안에서만 금액에 비례하며, 전체 금액 비율이 아닙니다.</p>
      <p>인정 실적 {formatWon(amount)}</p>
      <ol>{tiers.map((tier, index) => <li key={tier.key}>{index + 1}구간 {formatWon(tier.minimumSpend)} · {amount >= tier.minimumSpend ? "달성" : "미달"}{tier.key === targetKey ? " · 내 목표" : ""}</li>)}</ol>
    </details>
  </div>;
}
