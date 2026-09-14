import Link from "next/link";
import type { LedgerWorkspace } from "@/features/ledger/types";
import { ledgerQueryHref, selectLedgerActivity, type LedgerQuery } from "@/features/ledger/workspace-view";
import { transactionEditorContext } from "@/lib/card-workspace/input-options";
import { TransactionCreateDialog } from "@/components/transactions/transaction-create-dialog";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { LedgerSummary } from "./ledger-summary";
import { LedgerActivityList } from "./ledger-activity-list";
import { householdHref, LedgerFilters, LedgerPeriod, type HouseholdView } from "./ledger-filters";

/** Server presentation. Only the selected rows and editor contexts cross the client boundary. */
export function LedgerWorkspaceView({ workspace, state, canMutate, synthetic = false, view = "/ledger" }: {
  workspace: LedgerWorkspace; state: LedgerQuery; canMutate: boolean; synthetic?: boolean; view?: HouseholdView;
}) {
  const projection = selectLedgerActivity(workspace, state);
  const cards = [...workspace.cardWorkspace.inputs.cards];
  const defaultCard = cards.find(card => card.is_default && !card.archived_at);
  const contexts = view === "/ledger" ? Object.fromEntries(projection.rows.flatMap(row => {
    const transaction = row.kind === "income" ? null : row.cardTransaction ?? row.transaction;
    return transaction ? [[transaction.id, transactionEditorContext(workspace.cardWorkspace, transaction)]] : [];
  })) : {};
  const filtered = Boolean(state.query || state.category || state.paymentMethod || state.card || state.kind !== "all");
  return <div className="household-workspace">
    <div className="household-heading"><h1>{view === "/ledger" ? "가계부" : "통계"}</h1>{synthetic ? <p className="household-note household-demo">가상 데이터 · 읽기 전용</p> : null}{view === "/dashboard" ? <a href={ledgerQueryHref(state)}>가계부 보기</a> : null}</div>
    <LedgerPeriod state={state} view={view} />
    <LedgerSummary totals={projection.periodTotals} label={state.period.kind === "month" ? "월 전체 합계" : "기간 전체 합계"} />
    {!projection.canAddIncome ? <p className="household-note" role="status">수입 기능 적용 필요 · 지출은 조회할 수 있습니다.</p> : null}
    {projection.reviewReasons.some(reason => reason !== "income_source_unsupported") ? <p className="household-note" role="status">일부 원본의 금액·일시 확인이 필요합니다. 확인 전 합계를 0원으로 표시하지 않습니다.</p> : null}
    <LedgerFilters state={state} view={view} userCards={cards} />
    {filtered ? <LedgerSummary totals={projection.filteredTotals} label="검색·필터 결과 합계" /> : null}
    <p className="household-result-count">{filtered ? "검색·필터 결과" : "전체 내역"} {projection.totalCount.toLocaleString("ko-KR")}건{projection.pageCount > 1 && view === "/ledger" ? ` · ${projection.page} / ${projection.pageCount} 페이지 (최대 50건)` : ""}</p>
    {view === "/dashboard" ? <DashboardSummary projection={projection} /> : <>
      <LedgerActivityList queryScope={ledgerQueryHref(state)} rows={projection.rows} dayTotals={projection.dayTotals} userCards={cards} contexts={contexts} month={projection.throughMonth} canMutate={canMutate} />
      {projection.pageCount > 1 ? <nav className="workspace-pagination" aria-label="내역 페이지">
        {projection.page > 1 ? <Link href={ledgerQueryHref(state, { page: projection.page - 1 })}>이전 페이지</Link> : <span />}
        <span>{projection.page} / {projection.pageCount}</span>
        {projection.page < projection.pageCount ? <Link href={ledgerQueryHref(state, { page: projection.page + 1 })}>다음 페이지</Link> : <span />}
      </nav> : null}
      <TransactionCreateDialog userCards={cards.filter(card => !card.archived_at)} defaultUserCardId={defaultCard?.id ?? null} month={projection.throughMonth} allowIncome incomeSupported={projection.canAddIncome} readOnly={!canMutate} entryFragments variant="floating" />
    </>}
    <footer className="household-footer"><a href={`/cards?${new URLSearchParams({ month: projection.throughMonth, tab: "transactions", ...(state.card ? { card: state.card } : {}) })}`}>카드 사용내역</a>{view === "/ledger" ? <a href={householdHref(state, "/dashboard")}>통계 보기</a> : null}{state.period.kind === "range" ? <span>카드는 기간 종료 월 {projection.throughMonth} 기준</span> : null}</footer>
  </div>;
}
