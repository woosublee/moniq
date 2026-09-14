"use client";
// Only copied into the existing isolated synthetic form harness.
import { useRef, useState } from "react";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import { TransactionCreateDialog } from "@/components/transactions/transaction-create-dialog";
import { IncomeExcludeForm } from "@/components/ledger/income-form";
import { LedgerDialog } from "@/components/transactions/ledger-dialog";
import { LedgerMutationBoundary } from "@/components/transactions/ledger-request-fields";
import type { IncomeEntryRecord } from "@/features/ledger/types";
import type { TransactionFormState } from "@/features/transactions/types";

const income: IncomeEntryRecord = { id: "10000000-0000-4000-8000-000000000016", owner_id: "synthetic-owner", version: "9007199254740993", stable_sequence: "1", occurred_at: "2026-02-24T15:30:22.123456Z", source_name: "Synthetic salary", amount: "123.456", ledger_category: "급여", memo: "original", input_excluded: false, created_at: "2026-02-25T00:00:00Z", updated_at: "2026-02-25T00:00:00Z" };
export function IncomeHarness() {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [changed, setChanged] = useState(false);
  const [requests, setRequests] = useState<Record<string, string>[]>([]);
  const [captures, setCaptures] = useState<Record<string, string>[]>([]);
  const count = useRef(0);
  async function action(_previous: TransactionFormState, data: FormData): Promise<TransactionFormState> {
    setRequests(rows => [...rows, Object.fromEntries([...data].map(([key, value]) => [key, String(value)]))]);
    await new Promise(resolve => setTimeout(resolve, 100));
    const index = count.current++;
    if (index === 1) throw new Error("lost response");
    return index === 0 ? { status: "error", message: "수입 수정 거절" } : { status: "saved_needs_review", message: "저장됨 · 수입 확인 필요", resultIds: [income.id] };
  }
  const current = changed ? { ...income, version: "9007199254740994", amount: "999", source_name: "fresh parent" } : income;
  return <section data-testid="income-edit-harness">
    <button onClick={() => setOpen(true)}>수입 수정 수명주기</button><button onClick={() => setChanged(true)}>수입 원본 prop 변경</button>
    {open ? <LedgerDialog title="수입 수정 검증" locked={locked} onClose={() => setOpen(false)}><LedgerMutationBoundary onLockChange={setLocked}>
      <TransactionForm initialIncome={current} defaultUserCardId={null} month={changed ? "2026-03" : "2026-02"} action={action} />
      <IncomeExcludeForm income={current} month="2026-02" action={action} />
    </LedgerMutationBoundary></LedgerDialog> : null}
    <pre data-testid="income-edit-requests" style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(requests)}</pre>
    <section onSubmitCapture={event => {
      event.preventDefault(); event.stopPropagation();
      setCaptures(rows => [...rows, Object.fromEntries([...new FormData(event.target as HTMLFormElement)].map(([key, value]) => [key, String(value)]))]);
    }}>
      <TransactionEditDialog income={income} month="2026-02" trigger="수입 원본 수정 열기" />
      <TransactionEditDialog income={{ ...income, input_excluded: true }} month="2026-02" trigger="제외된 수입 열기" />
      <TransactionEditDialog income={income} month="2026-02" readOnly trigger="읽기 전용 수입 열기" />
      <TransactionCreateDialog userCards={[]} defaultUserCardId={null} month="2026-02" allowIncome incomeSupported />
    </section>
    <pre data-testid="income-editor-captures" style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(captures)}</pre>
  </section>;
}
