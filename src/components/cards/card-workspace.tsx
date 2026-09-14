import Link from "next/link";
import Form from "next/form";
import type { ReactNode } from "react";
import type { CardWorkspace } from "@/lib/card-workspace/view-model";
import { cardsHref, ledgerHref, type CardsQuery } from "@/features/cards/workspace-view";
import { CardWorkspaceTabs } from "./card-workspace-tabs";
import { MonthSelector } from "./month-selector";
import { PerformanceCardList } from "./performance-card-list";
import { BenefitCardList } from "./benefit-card-list";
import { CardActivityList } from "./card-activity-list";

/** Server presentation: never put a use-client boundary around the private snapshot. */
export function CardWorkspaceView({ workspace, state, canMutate, synthetic = false, actions, management }: { workspace: CardWorkspace; state: CardsQuery; canMutate: boolean; synthetic?: boolean; actions?: ReactNode; management?: ReactNode }) {
  const allSummaries = workspace.summaries.filter(summary => !summary.userCard.archived_at).sort((a, b) => (a.userCard.sort_order ?? 0) - (b.userCard.sort_order ?? 0) || a.userCard.id.localeCompare(b.userCard.id));
  const summaries = allSummaries.filter(({ userCard }) => (!state.card || state.card === userCard.id) && (!state.query || `${userCard.card.name} ${userCard.card.issuer} ${userCard.alias ?? ""}`.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())));
  return <div className="card-workspace" key={`${state.month}:${state.tab}:${state.query}:${state.card}:${state.page}`}>
    <div className="workspace-heading"><h1>내 카드</h1>{actions || <Link href={`/cards/search?month=${state.month}`}>카드 찾기</Link>}</div>
    {synthetic ? <p className="workspace-demo">가상 데이터 · 읽기 전용 · 2026년 2월 예시<br />실제 상품·약관 검증 결과가 아닙니다.</p> : null}
    <div className="workspace-controls"><CardWorkspaceTabs state={state} /><MonthSelector state={state} /></div>
    <Form action="/cards" className="workspace-filters">
      <input type="hidden" name="month" value={state.month} /><input type="hidden" name="tab" value={state.tab} />
      <label className="workspace-search"><span className="sr-only">{state.tab === "transactions" ? "가맹점·카드 검색" : "카드 검색"}</span><input name="query" defaultValue={state.query} placeholder={state.tab === "transactions" ? "가맹점·카드 검색" : "카드 검색"} maxLength={120} /></label>
      {state.tab === "transactions" ? <label className="workspace-card-filter"><span className="sr-only">결제 카드</span><select name="card" defaultValue={state.card}><option value="">모든 결제</option>{allSummaries.map(({ userCard }) => <option value={userCard.id} key={userCard.id}>{userCard.alias || userCard.card.name}</option>)}</select></label> : <input type="hidden" name="card" value={state.card} />}
      <button type="submit">검색</button>{state.query || state.card ? <Link href={cardsHref(state, { query: "", card: "" })}>초기화</Link> : null}
    </Form>
    {state.tab === "transactions" ? <CardActivityList workspace={workspace} state={state} canMutate={canMutate} /> : !summaries.length ? <div className="workspace-empty"><h2>{allSummaries.length ? "조건에 맞는 카드가 없습니다" : "아직 등록한 카드가 없어요"}</h2><p>{allSummaries.length ? "검색어나 카드 필터를 바꿔보세요." : "카드를 추가하면 실적과 혜택을 한곳에서 확인할 수 있습니다."}</p><Link href={allSummaries.length ? cardsHref(state, { query: "", card: "" }) : `/cards/search?month=${state.month}`}>{allSummaries.length ? "전체 카드 보기" : "카드 찾기"}</Link></div> : state.tab === "performance" ? <PerformanceCardList workspace={workspace} summaries={summaries} state={state} /> : <BenefitCardList workspace={workspace} summaries={summaries} state={state} synthetic={synthetic} />}
    <footer className="workspace-footer"><a href={ledgerHref(state.month, canMutate, state.card)}>{canMutate ? "빠진 내역 입력" : "가계부 보기"}</a><a href={ledgerHref(state.month, false, state.card).replace("/ledger", "/dashboard")}>통계</a></footer>
    {management ? <details className="workspace-management"><summary>등록 카드 관리</summary>{management}</details> : null}
  </div>;
}
