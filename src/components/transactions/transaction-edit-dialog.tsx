"use client";
import { useState } from "react";
import { LedgerMutationBoundary } from "./ledger-request-fields";
import { LocalDate } from "./local-date";
import { updateTransaction } from "@/app/transactions/new/actions";
import { TransactionDeleteForm } from "./transaction-delete-form";
import { TransactionForm } from "./transaction-form";
import { TransactionCalculationSummary } from "./transaction-calculation-summary";
import { TransactionAnnotationForm } from "./transaction-annotation-form";
import { TransactionCancelDialog } from "./transaction-cancel-dialog";
import { LedgerDialog } from "./ledger-dialog";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionRecord } from "@/features/transactions/types";
import type { TransactionEditorContext } from "@/lib/card-workspace/input-options";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";
import { IncomeEditDialog } from "@/components/ledger/income-edit-dialog";
import type { IncomeEntryRecord } from "@/features/ledger/types";

type SharedDialogProps = { month?: string; trigger?: React.ReactNode; triggerClassName?: string; disabled?: boolean; readOnly?: boolean };
export type TransactionEditDialogProps = SharedDialogProps & (
  | { income: IncomeEntryRecord; transaction?: never; userCards?: UserCardRecord[]; context?: never }
  | { income?: never; transaction: TransactionRecord; userCards: UserCardRecord[]; context?: TransactionEditorContext }
);
export function TransactionEditDialog(props: TransactionEditDialogProps) {
  return props.income ? <IncomeEditDialog {...props} income={props.income} /> : <ExpenseEditDialog {...props} />;
}
function ExpenseEditDialog({ transaction, userCards, context, month, trigger, triggerClassName = "block", disabled = false, readOnly = false }: SharedDialogProps & {
  transaction: TransactionRecord; userCards: UserCardRecord[]; context?: TransactionEditorContext;
}) {
  const [open, setOpen] = useState(false);
  return <><button type="button" disabled={disabled} onClick={() => setOpen(true)} className={triggerClassName} aria-label={trigger ? undefined : "거래 상세·수정"}>{trigger ?? "수정"}</button>
    {open ? <Editor key={`${transaction.id}:${open}`} transaction={transaction} userCards={userCards} context={context} month={month} readOnly={readOnly} onClose={() => setOpen(false)} /> : null}</>;
}
function Editor({ transaction: current, userCards, context: currentContext, month, readOnly, onClose }: { transaction: TransactionRecord; userCards: UserCardRecord[]; context?: TransactionEditorContext; month?: string; readOnly: boolean; onClose: () => void }) {
  const [transaction] = useState(current);
  const [context] = useState(currentContext);
  const [locked, setLocked] = useState(false);
  const selectedMonth = month ?? transaction.workspace?.projection.month ?? currentSeoulMonth();
  return <LedgerDialog title="거래 상세·수정" locked={locked} onClose={onClose}><LedgerMutationBoundary onLockChange={setLocked}>
    {readOnly ? <><p className="workspace-note">읽기 전용 · 원본과 계산 근거를 확인할 수 있습니다.</p><h3>{transaction.merchant_name}</h3><TransactionCalculationSummary transaction={transaction} /></> : <TransactionForm userCards={userCards} defaultUserCardId={transaction.user_card_id} compact initialTransaction={transaction} month={selectedMonth} action={updateTransaction.bind(null, transaction.id)} />}
    {context ? <TransactionAnnotationForm transactionId={transaction.id} context={context} month={selectedMonth} readOnly={readOnly} /> : <p className="ledger-preserved">보정 대상과 환불 이력 확인 필요 · 내 카드 사용내역에서 최신 거래 상세를 열어 주세요.</p>}
    {!readOnly && context ? <TransactionCancelDialog transaction={transaction} refundableAmount={context.refundableAmount} month={selectedMonth} disabled={locked} /> : null}
    {!readOnly ? <TransactionDeleteForm transactionId={transaction.id} version={transaction.version} month={selectedMonth} /> : null}
    {context?.refunds.map(refund => <p className="workspace-note" key={refund.id}>연결 환불 <LocalDate value={refund.occurred_at} /> · 원문 {String(refund.amount)}원</p>)}
  </LedgerMutationBoundary></LedgerDialog>;
}
