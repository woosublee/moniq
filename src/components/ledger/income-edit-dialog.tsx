"use client";
import { useState, type ReactNode } from "react";
import { LedgerDialog } from "@/components/transactions/ledger-dialog";
import { LedgerMutationBoundary } from "@/components/transactions/ledger-request-fields";
import type { IncomeEntryRecord } from "@/features/ledger/types";
import { IncomeExcludeForm, IncomeForm } from "./income-form";

export function IncomeEditDialog({ income, month, trigger, triggerClassName = "block", disabled = false, readOnly = false }: {
  income: IncomeEntryRecord; month?: string; trigger?: ReactNode; triggerClassName?: string; disabled?: boolean; readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <><button type="button" disabled={disabled} onClick={() => setOpen(true)} className={triggerClassName} aria-label={trigger ? undefined : "수입 상세·수정"}>{trigger ?? "수정"}</button>
    {open ? <IncomeEditor income={income} month={month} readOnly={readOnly} onClose={() => setOpen(false)} /> : null}</>;
}
function IncomeEditor({ income: current, month: currentMonth, readOnly, onClose }: { income: IncomeEntryRecord; month?: string; readOnly: boolean; onClose: () => void }) {
  const [income] = useState(current);
  const [month] = useState(currentMonth);
  const [locked, setLocked] = useState(false);
  return <LedgerDialog title="수입 상세·수정" locked={locked} onClose={onClose}><LedgerMutationBoundary onLockChange={setLocked}>
    {readOnly ? <><p className="workspace-note">읽기 전용 · 수입 원본</p><h3>{income.source_name}</h3><dl className="ledger-calculation"><div>원문 일시 {income.occurred_at}</div><div>수입 {String(income.amount)}원</div><div>분류 {income.ledger_category ?? "미분류"}</div><div>메모 {income.memo ?? "없음"}</div><div>{income.input_excluded ? "합계에서 제외됨" : "합계에 포함"}</div></dl></> : <>
      <IncomeForm income={income} month={month} compact />
      <IncomeExcludeForm income={income} month={month} />
    </>}
  </LedgerMutationBoundary></LedgerDialog>;
}
