"use client";
import { useCallback, useState } from "react";
import { createTransactionRefund } from "@/app/transactions/new/actions";
import { LedgerActionForm } from "./ledger-request-fields";
import { LedgerDialog } from "./ledger-dialog";
import { initialTransactionFormState } from "@/features/transactions/constants";
import type { TransactionFormState, TransactionRecord } from "@/features/transactions/types";
import { formatWon, getTransactionAmounts } from "@/lib/card-workspace/view-model";
export function TransactionCancelDialog({ transaction, refundableAmount, month, disabled = false }: { transaction: TransactionRecord; refundableAmount: number | null; month: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const onState = useCallback((state: TransactionFormState, pending: boolean) => setLocked(pending || state.status === "outcome_unknown"), []);
  return <><button type="button" className="workspace-text-link" disabled={disabled} onClick={() => setOpen(true)}>실제 취소·부분취소 기록</button>{open ? <LedgerDialog title="실제 취소·부분취소" locked={locked} onClose={() => setOpen(false)}>
    <p>원거래 {transaction.merchant_name} · 승인 원금 {formatWon(getTransactionAmounts(transaction).actualAmount)}</p><p>남은 환불 가능액 {formatWon(refundableAmount)}</p>
    <p className="workspace-note">실제로 환불받은 금액과 날짜를 입력하세요. 원거래는 지우지 않습니다. 환불 입금은 발생월, 혜택·실적은 약관에 따라 원거래 월부터 다시 계산합니다.</p>
    {refundableAmount === null || refundableAmount === 0 ? <p className="ledger-preserved">{refundableAmount === null ? "보존 원금이나 기존 환불 금액을 정확히 확인할 수 없습니다." : "승인 원금 전액의 환불이 이미 기록되어 있습니다."} 추가 환불을 입력할 수 없습니다.</p> : <LedgerActionForm action={createTransactionRefund.bind(null, transaction.id)} initial={initialTransactionFormState} month={month} create submitLabel="환불 기록 저장" onState={onState}>
      <input type="hidden" name="transactionVersion" value={String(transaction.version ?? "")} />
      <label>환불 금액 · 원<input name="amount" type="number" min="1" max={refundableAmount} step="1" required /></label>
      <label>환불 날짜<input name="occurredAt" type="date" required defaultValue={`${month}-01`} /></label>
      <label>환불 시각 · 한국 시간<input name="occurredTime" type="time" step="1" /></label>
      <p className="workspace-note">날짜만 입력하면 한국 시간 00:00으로 기록됩니다. 당일 결제 후 환불은 실제 환불 시각도 입력하세요. 결제보다 이른 시각은 저장할 수 없으며, 시각을 임의로 채우거나 다음 날로 옮기지 마세요.</p>
      <label>환불 메모<input name="memo" maxLength={2000} /></label>
      <label className="ledger-check"><input type="checkbox" required />실제 취소·환불 내역을 확인했습니다.</label>
    </LedgerActionForm>}
  </LedgerDialog> : null}</>;
}
