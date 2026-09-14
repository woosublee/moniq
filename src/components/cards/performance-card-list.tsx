import type { CardPerformanceSummary } from "@/features/card-benefits/types";
import type { ScopeSummary } from "@/features/card-benefits/engine-types";
import { workspaceCardPolicy, workspacePerformanceScopes, ledgerHref, type CardsQuery } from "@/features/cards/workspace-view";
import { formatWon, getTransactionAmounts, sumKnown, type CardWorkspace } from "@/lib/card-workspace/view-model";
import { WorkspaceCardHeader } from "./workspace-card-header";
import { PerformanceTierProgress } from "./performance-tier-progress";
import { WorkspaceReasons } from "./workspace-reasons";

function scopeStatus(scope: ScopeSummary) {
  if (scope.amount === null || scope.status === "missing") return "입력 자료 확인 필요";
  if (scope.status === "highest_tier") return "최고 구간 달성";
  if (scope.status === "known_zero") return "입력 완료 · 사용 0원";
  return scope.status === "met" ? "구간 달성" : "첫 구간까지";
}
export function PerformanceCardList({ workspace, summaries, state }: { workspace: CardWorkspace; summaries: CardPerformanceSummary[]; state: CardsQuery }) {
  return <div className="workspace-card-list">{summaries.map(summary => {
    const card = summary.userCard;
    const projection = summary.workspace;
    const policy = workspaceCardPolicy(workspace, summary);
    const unverified = !projection || projection.requirementStatus === "unverified" || !policy;
    const noRequirement = !unverified && projection.requirementStatus === "no_requirement";
    const scopes = workspacePerformanceScopes(workspace, summary);
    const ownRows = workspace.transactions.filter(row => !row.input_excluded && row.user_card_id === card.id && row.workspace?.projection.month === state.month);
    const actual = sumKnown(ownRows.map(row => getTransactionAmounts(row).actualAmount));
    const status = scopes.length ? scopes.some(({ metadata }) => !metadata) ? "실적 기준·합산 대상 확인 필요" : scopes.length === 1 ? scopeStatus(scopes[0].scope) : "실적 범위별 확인" : unverified ? "약관·적용 기간 확인 필요" : noRequirement ? "실적 조건 없음" : "실적 범위 확인 필요";
    return <article key={card.id} className="workspace-card" data-card-id={card.id}>
      <WorkspaceCardHeader card={card} state={state} status={status} />
      {unverified || noRequirement ? <p className="workspace-note">{scopes.length ? unverified ? "월말 약관·적용 기간은 확인이 필요합니다. 이 달에 식별된 실적 범위는 별도로 표시합니다." : "월말 약관에는 실적 조건이 없습니다. 이 달의 이전 적용 범위는 별도로 표시합니다." : unverified ? "검증된 규칙이 없어 달성 여부를 계산하지 않습니다." : "확인된 약관에 실적 조건이 없는 카드입니다."}</p> : null}
      {scopes.map(({ scope, metadata }) => {
        const contributors = metadata?.contributors ?? [];
        return <section key={JSON.stringify([scope.scopeInstanceKey, scope.scopeKey])} className="workspace-scope" aria-label={`실적 범위 ${scope.scopeKey}`}>
          {scopes.length > 1 ? <h3>실적 범위 {scope.scopeKey} · {metadata ? scopeStatus(scope) : "실적 기준·합산 대상 확인 필요"}</h3> : null}
          {!metadata ? <p className="workspace-note">실적 기준·합산 대상 확인 필요 · 해당 범위의 적용 판본을 정확히 식별할 수 없어 구간·목표·합산 대상을 표시하지 않습니다.</p> : scope.amount !== null ? <PerformanceTierProgress label={`${card.card.name} ${scope.scopeKey}`} tiers={metadata.definition.tiers} amount={scope.amount} targetKey={scope.target?.tierKey} /> : <p className="workspace-note">입력 자료 확인 필요 · 미입력을 0원 실적으로 계산하지 않습니다.</p>}
          <dl className="workspace-amounts">
            <div><dt>인정 실적</dt><dd className="performance-amount">{formatWon(scope.amount)}</dd></div>
            {scopes.length === 1 ? <div><dt>사용금액 <small>승인 원금</small></dt><dd>{formatWon(actual)}</dd></div> : null}
            <div><dt>다음 구간까지</dt><dd>{!metadata ? "확인 필요" : scope.status === "highest_tier" ? "최고 구간 달성" : formatWon(scope.remaining)}</dd></div>
            {scope.target ? <div><dt>내 목표까지</dt><dd>{!metadata ? "확인 필요" : scope.target.status === "met" ? "내 목표 달성" : formatWon(scope.target.remaining)}</dd></div> : null}
            {scope.source === "manual_total" ? <div><dt>입력 기준</dt><dd>수동 월 총액 · 원장 {formatWon(scope.ledgerAmount)}</dd></div> : null}
            {contributors.length > 1 ? <div><dt>실적 합산 대상</dt><dd>{contributors.map(card => card.alias || card.card.name).join(", ")}<small>직접 합산 · 다른 합산 관계로 확장하지 않음</small></dd></div> : null}
          </dl>
          <WorkspaceReasons reasons={scope.reasons} />
          {scope.amount === null ? <a className="workspace-text-link" href={ledgerHref(state.month, false, card.id)}>빠진 내역 확인</a> : null}
        </section>;
      })}
      {scopes.length !== 1 ? <dl className="workspace-amounts"><div><dt>사용금액 <small>승인 원금</small></dt><dd>{formatWon(actual)}</dd></div></dl> : null}
      {summary.manualTotalMismatches?.length ? <WorkspaceReasons reasons={["manual_total_mismatch"]} /> : null}
    </article>;
  })}</div>;
}
