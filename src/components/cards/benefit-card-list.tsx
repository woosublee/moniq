import type { CardPerformanceSummary } from "@/features/card-benefits/types";
import { summarizeBenefits } from "@/features/card-benefits/summaries";
import { workspaceBenefitServices, workspaceQuotaGroups, type CardsQuery } from "@/features/cards/workspace-view";
import { buildBenefitDisplay, formatBenefitDisplay } from "@/lib/card-workspace/benefit-display";
import { formatWon, getCardBenefitLabel, type CardWorkspace } from "@/lib/card-workspace/view-model";
import { findPublicCardCandidate } from "@/features/card-benefits/catalog";
import { WorkspaceCardHeader } from "./workspace-card-header";
import { WorkspaceReasons } from "./workspace-reasons";

export function BenefitCardList({ workspace, summaries, state, synthetic = false }: { workspace: CardWorkspace; summaries: CardPerformanceSummary[]; state: CardsQuery; synthetic?: boolean }) {
  const ids = new Set(summaries.map(summary => summary.userCard.id));
  const groups = workspaceQuotaGroups(workspace).filter(group => group.cardIds.some(id => ids.has(id)));
  return <>
    <div className="workspace-card-list">{summaries.map(summary => {
      const services = workspaceBenefitServices(workspace, summary);
      const multipleVersions = new Set(services.map(service => service.versionId)).size > 1;
      const rows = workspace.transactions.filter(row => !row.input_excluded && row.user_card_id === summary.userCard.id && row.workspace?.projection.month === state.month);
      const candidate = findPublicCardCandidate(summary.userCard.card);
      const reasons = rows.flatMap(row => row.workspace?.projection.reasons ?? []);
      return <article className="workspace-card" key={summary.userCard.id}>
        <WorkspaceCardHeader card={summary.userCard} state={state} status={summary.benefitDisplay?.complete ? "입력 내역 기준" : "혜택 확인 필요"} />
        <dl className="workspace-amounts benefit-total"><div><dt>받은 혜택</dt><dd>{getCardBenefitLabel(summary)}</dd></div></dl>
        {services.map(({ key, versionId, version, definition, applied, incomplete }) => {
          const label = applied.length ? formatBenefitDisplay(buildBenefitDisplay(summarizeBenefits(applied), applied, incomplete)) : "적용 내역 없음";
          return <div className="workspace-service" key={JSON.stringify([versionId, key])}>
            <h3>{key}</h3>
            {multipleVersions && version ? <p className="workspace-note">판본 {version.version_order} · {version.version_label}<br />적용일 {version.effective_from} 이상{version.effective_until ? ` · ${version.effective_until} 미만` : " · 종료일 없음"}</p> : null}
            <p>{label}</p>
            {definition ? <p className="workspace-note">{definition.performance.kind === "none" ? "실적 조건 없음" : `${definition.performance.kind === "previous_month" ? "전월" : "당월"} 실적 · ${definition.performance.scopeKey}`} {definition.quotaKeys.length ? `· 연결 한도 ${definition.quotaKeys.join(", ")}` : "· 등록된 공통 한도 없음"}</p> : <p className="workspace-note">혜택 조건·적용 판본 확인 필요 · 적용 내역은 유지하며 다른 판본의 조건을 대신 표시하지 않습니다.</p>}
            <WorkspaceReasons reasons={applied.flatMap(row => row.reasons)} />
          </div>;
        })}
        <WorkspaceReasons reasons={reasons} fallback={!summary.benefitDisplay?.complete ? "약관·적용 기간 또는 입력 자료가 미확인입니다. 미확인 혜택은 0원으로 합산하지 않습니다." : undefined} />
        <details className="workspace-provenance"><summary>규칙 출처와 지원 범위</summary>
          {synthetic ? <p>가상 시나리오 전용 규칙입니다. 실제 상품의 효력일·약관·자동 계산 검증 결과가 아닙니다.</p> : candidate ? <><p>출처 · 공식 설명서 확보</p><p>구현 · 일부 조건만 구현</p><p>적용 기간 · 미검증</p><p>절사·운영 입력 매퍼 미검증 · 실제 상품 자동 계산 대기</p><a href={candidate.source.url} target="_blank" rel="noreferrer">공식 설명서 보기</a></> : <p>상품·약관 검증 대기. 등록된 계산 판본과 실제 보유 상품의 적용 조건을 확인해야 합니다.</p>}
        </details>
      </article>;
    })}</div>
    <section className="workspace-quotas" aria-labelledby="quota-heading"><h2 id="quota-heading">한도 사용 현황</h2><p className="workspace-note">같은 공유 한도는 한 번만 표시합니다. 서로 다른 단위와 기간의 잔여량은 합산하지 않습니다.</p>
      {groups.length ? groups.map(({ quota, cardNames, services, shared }) => {
        const amount = (value: number | null) => value === null ? "확인 필요" : quota.consumption === "count" ? `${value.toLocaleString("ko-KR")}회` : quota.consumption === "eligible_spend" ? formatWon(value) : formatBenefitDisplay({ complete: true, totals: [{ unit: quota.unit, amount: value, reasons: [], sources: [] }] });
        return <article className="workspace-quota" key={quota.poolKey}><h3>{shared ? "공유 한도" : "개별 한도"} · {quota.scopeKey}</h3><p>{cardNames.join(", ")}</p><p className="workspace-note">{services.join(" / ")} · {quota.period === "daily" ? `일별 ${quota.periodKey}` : `월별 ${quota.periodKey}`}</p>
          <dl className="workspace-amounts"><div><dt>전체 한도</dt><dd>{amount(quota.cap)}</dd></div><div><dt>{quota.consumption === "count" ? "사용 횟수" : quota.consumption === "eligible_spend" ? "한도 사용 대상 결제액" : "혜택 한도 사용"}</dt><dd>{amount(quota.consumed)}</dd></div><div><dt>{quota.consumption === "count" ? "남은 횟수" : quota.consumption === "eligible_spend" ? "남은 대상 결제액" : "남은 혜택"}</dt><dd>{amount(quota.remaining)}</dd></div></dl><WorkspaceReasons reasons={quota.reasons} />
        </article>;
      }) : <p className="workspace-empty">이 달에 계산된 한도 내역이 없습니다. 미확인 한도를 무제한으로 간주하지 않습니다.</p>}
    </section>
  </>;
}
