"use client";
import { useCallback, useRef, useState } from "react";
import { excludeIncome, updateIncome } from "@/app/transactions/new/actions";
import { LedgerActionForm } from "@/components/transactions/ledger-request-fields";
import { initialTransactionFormState } from "@/features/transactions/constants";
import type { TransactionFormState } from "@/features/transactions/types";
import type { IncomeEntryRecord } from "@/features/ledger/types";
import { IncomeFields } from "./income-fields";
import { parseSeoulInstant } from "@/features/card-benefits/periods";

type FormAction = (previous: TransactionFormState, data: FormData) => Promise<TransactionFormState>;
export function IncomeForm({ income: current, month, compact = false, action, onSuccess, onLockChange }: {
  income: IncomeEntryRecord; month?: string; compact?: boolean; action?: FormAction;
  onSuccess?: () => void; onLockChange?: (locked: boolean) => void;
}) {
  const [income] = useState(current);
  const [date] = useState(() => parseSeoulInstant(income.occurred_at)?.day ?? "");
  const lastCompleted = useRef<string | undefined>(undefined);
  const onState = useCallback((state: TransactionFormState, pending: boolean) => {
    onLockChange?.(pending || state.status === "outcome_unknown");
    if (state.status === "success" && lastCompleted.current !== state.requestId) {
      lastCompleted.current = state.requestId; onSuccess?.();
    }
  }, [onLockChange, onSuccess]);
  return <section className={compact ? "ledger-entry" : "ledger-entry ledger-section"}>
    {!compact ? <h2>수입 상세 수정</h2> : null}
    <p className="workspace-note">저장된 종류는 바꿀 수 없습니다. 종류가 잘못됐다면 이 내역을 제외하고 새로 입력하세요.</p>
    <LedgerActionForm action={action ?? updateIncome.bind(null, income.id)} initial={initialTransactionFormState} version={income.version} month={month} submitLabel="수입 저장" onState={onState}>
      <IncomeFields income={income} date={date} />
    </LedgerActionForm>
  </section>;
}

export function IncomeExcludeForm({ income: current, month, action, onState }: {
  income: IncomeEntryRecord; month?: string; action?: FormAction; onState?: (state: TransactionFormState, pending: boolean) => void;
}) {
  const [income] = useState(current);
  const restoring = income.input_excluded;
  return <details className="ledger-auxiliary"><summary>{restoring ? "제외된 수입 복원" : "잘못 입력한 수입 제외"}</summary>
    <p>{restoring ? "보존된 원본을 가계부 합계에 다시 포함합니다." : "가계부 합계에서만 빼며 수입 원본은 보존합니다. 나중에 복원할 수 있습니다."}</p>
    <LedgerActionForm action={action ?? excludeIncome.bind(null, income.id)} initial={initialTransactionFormState} version={income.version} month={month} submitLabel={restoring ? "수입 복원" : "수입 제외"} onState={onState}>
      <input type="hidden" name="excluded" value={String(!restoring)} />
      <label className="ledger-check"><input type="checkbox" required />{restoring ? "이 수입을 다시 포함합니다." : "잘못 입력한 수입입니다."}</label>
    </LedgerActionForm>
  </details>;
}
