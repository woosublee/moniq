"use client";
import { Fragment } from "react";
import type { LedgerActivityRow } from "@/features/ledger/projection";
import type { LedgerDayTotal } from "@/features/ledger/workspace-view";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionEditorContext } from "@/lib/card-workspace/input-options";
import { formatWon } from "@/lib/card-workspace/view-model";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import { TransactionCalculationSummary } from "@/components/transactions/transaction-calculation-summary";
import { useLedgerSelection } from "@/components/transactions/use-ledger-selection";
import type { deleteTransactions } from "@/app/transactions/new/actions";

const kindLabels = { expense: "지출", income: "수입", refund: "환불" };
const payments = { cash: "현금", credit_card: "신용카드", check_card: "체크카드", points: "포인트" };
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" });
export type LedgerActivityListProps = {
  rows: LedgerActivityRow[]; dayTotals: LedgerDayTotal[]; userCards: UserCardRecord[];
  contexts: Record<string, TransactionEditorContext>; month: string; canMutate: boolean;
  excludeAction?: typeof deleteTransactions; queryScope?: string;
};
export function LedgerActivityList({ rows, dayTotals, userCards, contexts, month, canMutate, excludeAction, queryScope }: LedgerActivityListProps) {
  const selection = useLedgerSelection(rows.filter(row => !row.economicExcluded).map(row => ({ key: row.key, ref: { ...row.ref, version: String(row.ref.version) } })), month, excludeAction, queryScope);
  const locked = selection.isPending || selection.uncertainDelete;
  return <section aria-label="가계부 내역" className="household-list">
    {canMutate && (rows.length || locked) ? <div className="household-selection">
      <label><input type="checkbox" aria-label="현재 페이지 전체 선택" checked={selection.allSelected} disabled={locked} onChange={selection.toggleAll} />현재 페이지 선택</label>
      {selection.selectedIds.length ? <><span>{selection.selectedIds.length}개 선택됨</span><button type="button" disabled={selection.isPending} onClick={selection.deleteSelected}>{selection.isPending ? "제외 중" : selection.uncertainDelete ? "같은 제외 요청 확인 / 재시도" : "선택 내역 제외"}</button><button type="button" disabled={locked} onClick={selection.clearSelection}>선택 해제</button></> : null}
    </div> : null}
    {selection.message ? <p role="status" className="ledger-preserved">{selection.message}</p> : null}
    {!rows.length ? <div className="household-empty"><h2>표시할 내역이 없습니다</h2><p>월·기간과 검색 조건을 확인하거나 내역을 추가하세요.</p></div> : <ol>{rows.map((row, index) => {
      const name = row.kind === "income" ? row.income.source_name : row.transaction?.merchant_name ?? "원거래 확인 필요";
      const day = row.day ? dayTotals.find(total => total.date === row.day) : null;
      const amount = `${row.amount === null || row.economicExcluded ? "" : row.kind === "expense" ? "−" : "+"}${formatWon(row.amount)}`;
      const trigger = <span className="household-entry-main"><span className="household-entry-name">{name}</span><strong><span className="household-kind-label">{kindLabels[row.kind]} </span>{amount}</strong></span>;
      const transaction = row.kind === "income" ? null : row.cardTransaction ?? row.transaction;
      return <Fragment key={row.key}>
        {index === 0 || rows[index - 1].day !== row.day ? <li className="household-day"><h2>{row.day ? dateFormatter.format(new Date(`${row.day}T00:00:00+09:00`)) : "날짜 확인 필요"}</h2>{day ? <p>하루 수입 {formatWon(day.incomeAmount)} · 하루 지출 {formatWon(day.expenseAmount)}</p> : <p>일별 합계에 날짜를 임의 배정하지 않습니다.</p>}</li> : null}
        <li className="household-entry" data-entry-key={row.key}>
          {canMutate ? <input className="household-row-check" type="checkbox" checked={selection.selectedIdSet.has(row.key)} disabled={locked || row.economicExcluded} onChange={() => selection.toggleTransaction(row.key)} aria-label={`${kindLabels[row.kind]} ${name} 선택`} /> : null}
          <div className="household-entry-body">
            {row.kind === "income" ? <TransactionEditDialog income={row.income} month={month} disabled={locked} readOnly={!canMutate} trigger={trigger} triggerClassName="household-entry-trigger" /> : transaction ? <TransactionEditDialog transaction={transaction} userCards={userCards} context={contexts[transaction.id]} month={month} disabled={locked} readOnly={!canMutate} trigger={trigger} triggerClassName="household-entry-trigger" /> : trigger}
            <p className="household-entry-meta">{row.category || "미분류"}{row.kind !== "income" ? ` / ${row.cardAlias || row.cardName || (row.paymentMethod ? payments[row.paymentMethod] : "결제수단 확인 필요")}` : ""}{row.isFixedCost ? " · 고정비" : ""}</p>
            {row.economicExcluded ? <p className="household-entry-status">합계 제외 · 원문 {String(row.rawAmount)}원</p> : row.amount === null ? <p className="household-entry-status">금액 확인 필요 · 원문 {String(row.rawAmount)}원</p> : null}
            {row.day === null ? <p className="household-entry-status">원문 일시 {row.occurredAt}</p> : null}
            {row.kind === "refund" ? <p className="household-entry-status">{row.refund.voided_at ? "무효화된 환불" : "환불 발생일에 지출 차감"} · {transaction ? "내역을 누르면 원거래 상세" : "연결 원거래 확인 필요"}</p> : null}
            {row.kind === "expense" && row.cardId && !row.economicExcluded && transaction ? <TransactionCalculationSummary transaction={transaction} compact /> : null}
          </div>
        </li>
      </Fragment>;
    })}</ol>}
  </section>;
}
