"use client";
import { deleteTransaction } from "@/app/transactions/new/actions";
import { LedgerActionForm } from "./ledger-request-fields";
import type { RevisionValue } from "@/features/card-benefits/types";
import type { TransactionFormState } from "@/features/transactions/types";
import { initialTransactionFormState } from "@/features/transactions/constants";
export function TransactionDeleteForm({ transactionId, version, month, onState }: { transactionId: string; version?: RevisionValue; month?: string; onState?: (state: TransactionFormState, pending: boolean) => void }) {
  return <details className="ledger-auxiliary"><summary>잘못 입력한 거래 제외</summary><p>실제 환불은 위의 취소·부분취소 기록을 사용하세요. 오입력 제외는 계산에서만 빼며 원본 연결은 보존합니다.</p>
    <LedgerActionForm action={deleteTransaction.bind(null, transactionId)} initial={initialTransactionFormState} version={version} month={month} submitLabel="오입력 제외" onState={onState}><label className="ledger-check"><input type="checkbox" required />실제 취소가 아니라 잘못 입력한 거래입니다.</label></LedgerActionForm>
  </details>;
}
