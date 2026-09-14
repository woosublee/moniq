import type { ReactNode } from "react";
import type { IncomeEntryRecord } from "@/features/ledger/types";

/** The same DOM inputs carry shared values when a new entry changes kind. */
export function EntryPrimaryFields({ kind, date, name = "", amount = "", dateTime = false, preserveOriginal = false, children }: {
  kind: "expense" | "income"; date: string; name?: string; amount?: string | number; dateTime?: boolean; preserveOriginal?: boolean; children?: ReactNode;
}) {
  return <div className="ledger-fields">
    <label>{kind === "income" ? "수입 날짜" : dateTime ? "사용 일시 · 한국 시간" : "사용 날짜"}<input name="occurredAt" type={dateTime ? "datetime-local" : "date"} defaultValue={date} required={!preserveOriginal || Boolean(date)} /></label>
    <label>{kind === "income" ? "수입 내용" : "사용처"}<input name={kind === "income" ? "sourceName" : "merchantName"} defaultValue={name} placeholder={kind === "income" ? "예: 월급, 중고 판매" : "예: 스타벅스 강남R"} required maxLength={200} /></label>
    <label>금액<input name="amount" inputMode={preserveOriginal ? "decimal" : "numeric"} pattern={preserveOriginal ? undefined : "[0-9]+"} defaultValue={amount} placeholder="예: 12000" required /></label>
    {children}
  </div>;
}

export function IncomeFields({ income, date }: { income: IncomeEntryRecord; date: string }) {
  return <>
    <input type="hidden" name="originalAmount" value={String(income.amount)} />
    <input type="hidden" name="originalLocalOccurredAt" value={date} />
    <EntryPrimaryFields kind="income" date={date} name={income.source_name} amount={income.amount} preserveOriginal />
    {!date ? <p className="ledger-preserved">날짜 확인 필요 · 원문 {income.occurred_at}. 날짜를 선택하지 않으면 원문을 유지합니다.</p> : null}
    <label>카테고리<input name="ledgerCategory" defaultValue={income.ledger_category ?? ""} maxLength={120} placeholder="예: 급여, 부수입" /></label>
    <label>메모<input name="memo" defaultValue={income.memo ?? ""} maxLength={2000} /></label>
    <p className="workspace-note">금액과 날짜를 바꾸지 않으면 원문을 보존합니다. 새 금액은 정수 원 단위로 입력하세요.</p>
  </>;
}
