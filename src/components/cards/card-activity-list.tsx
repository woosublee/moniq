import Link from "next/link";
import { cardsHref, ledgerHref, selectWorkspaceActivity, type CardsQuery } from "@/features/cards/workspace-view";
import { formatWon, getTransactionBenefitLabel, type CardWorkspace } from "@/lib/card-workspace/view-model";
import { WorkspaceReasons } from "./workspace-reasons";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import { transactionEditorContext } from "@/lib/card-workspace/input-options";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
export function CardActivityList({ workspace, state, canMutate = false }: { workspace: CardWorkspace; state: CardsQuery; canMutate?: boolean }) {
  const activity = selectWorkspaceActivity(workspace, state);
  return <section aria-label="월 사용내역">
    <dl className="workspace-amounts activity-totals"><div><dt>월 전체 승인 원금</dt><dd>{formatWon(activity.actualAmount)}</dd></div><div><dt>이번 달 환불 입금</dt><dd>{formatWon(activity.refundAmount)}</dd></div><div><dt>순 현금흐름 <small>승인 − 환불</small></dt><dd>{formatWon(activity.cashFlowAmount)}</dd></div></dl>
    <p className="workspace-note">현재 검색·카드 필터의 월 전체 합계 · {activity.totalCount}건. 페이지를 바꿔도 합계는 유지됩니다.</p>
    {!activity.rows.length ? <div className="workspace-empty"><h2>사용내역이 없습니다</h2><p>선택한 월과 필터를 확인하거나 빠진 지출을 기록하세요.</p><a href={ledgerHref(state.month, true, state.card)}>지출 입력으로 이동</a></div> : <ol className="workspace-activity">{activity.rows.map((row, index) => {
      const day = dateFormatter.format(new Date(row.occurredAt));
      const previous = activity.rows[index - 1];
      return <li key={`${row.kind}-${row.id}`}>
        {!previous || dateFormatter.format(new Date(previous.occurredAt)) !== day ? <h2 className="activity-date">{day}</h2> : null}
        <article className="activity-entry"><div className="activity-entry-top"><h3>{row.transaction.merchant_name}</h3><strong>{row.kind === "refund" ? "환불 " : ""}{formatWon(row.amount)}</strong></div>
          <p className="workspace-note">{row.transaction.user_cards?.alias || row.transaction.user_cards?.card.name || "현금·기타 결제"} · {row.transaction.ledger_category || "미분류"}{row.transaction.is_fixed_cost ? " · 고정비" : ""}</p>
          {row.kind === "purchase" ? <p className="activity-benefit">혜택 {getTransactionBenefitLabel(row.transaction)}</p> : <p className="workspace-note">환불 발생월 현금흐름 · 혜택·실적은 원거래 귀속월 재계산</p>}
          <WorkspaceReasons reasons={row.transaction.workspace?.projection.reasons ?? []} />
          <TransactionEditDialog transaction={row.transaction} userCards={workspace.inputs.cards.slice()} context={transactionEditorContext(workspace, row.transaction)} month={state.month} readOnly={!canMutate} trigger={row.kind === "refund" ? "원거래 상세" : "거래 상세·수정"} triggerClassName="workspace-text-link" />
        </article>
      </li>;
    })}</ol>}
    {activity.pageCount > 1 ? <nav className="workspace-pagination" aria-label="사용내역 페이지">
      {activity.page > 1 ? <Link href={cardsHref(state, { page: activity.page - 1 })}>이전 50건</Link> : <span />}
      <span>{activity.page} / {activity.pageCount}</span>
      {activity.page < activity.pageCount ? <Link href={cardsHref(state, { page: activity.page + 1 })}>다음 50건</Link> : <span />}
    </nav> : null}
  </section>;
}
