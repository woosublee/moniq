"use client";
import { useEffect, useState } from "react";
import { LedgerActionFeedback, LedgerRequestFields, useLedgerActionState } from "./ledger-request-fields";
import { createTransaction } from "@/app/transactions/new/actions";
import { parseSeoulInstant } from "@/features/card-benefits/periods";
import { PaymentDetailsFields } from "./payment-details-fields";
import { IncomeForm } from "@/components/ledger/income-form";
import type { IncomeEntryRecord } from "@/features/ledger/types";
import { TransactionCalculationSummary } from "./transaction-calculation-summary";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionFormState, TransactionRecord } from "@/features/transactions/types";
import { initialTransactionFormState, ledgerCategories, paymentMethodOptions } from "@/features/transactions/constants";

type SharedFormProps = {
  userCards?: UserCardRecord[]; defaultUserCardId: string | null; compact?: boolean; month?: string;
  onSuccess?: () => void; onLockChange?: (locked: boolean) => void; action?: (previous: TransactionFormState, data: FormData) => Promise<TransactionFormState>;
};
export type TransactionFormProps = SharedFormProps & (
  | { initialIncome: IncomeEntryRecord; initialTransaction?: never }
  | { initialIncome?: never; initialTransaction?: TransactionRecord | null }
);
export function TransactionForm(props: TransactionFormProps) {
  return props.initialIncome
    ? <IncomeForm income={props.initialIncome} month={props.month} compact={props.compact} action={props.action} onSuccess={props.onSuccess} onLockChange={props.onLockChange} />
    : <ExpenseTransactionForm {...props} />;
}
function ExpenseTransactionForm({ userCards = [], defaultUserCardId, compact = false, initialTransaction, month, onSuccess, onLockChange, action }: SharedFormProps & { initialTransaction?: TransactionRecord | null }) {
  const [original] = useState(initialTransaction);
  const selectedMonth = month ?? original?.workspace?.projection.month ?? undefined;
  const [state, formAction, pending, onSubmit, blocked] = useLedgerActionState(action ?? createTransaction, initialTransactionFormState, { version: original?.version, month: selectedMonth, create: !original });
  const [occurredAt] = useState(() => {
    // Empty is an unchanged-display sentinel, not a replacement for the raw date.
    // Validate the calendar too: Date alone silently normalizes February 30.
    if (original && !parseSeoulInstant(original.occurred_at)) return "";
    return new Date(new Date(original?.occurred_at ?? Date.now()).getTime() + 9 * 3600000).toISOString().slice(0, 16);
  });
  const complete = state.status === "success" || state.status === "saved_needs_review";
  useEffect(() => { if (state.status === "success") onSuccess?.(); }, [state.status, onSuccess]);
  useEffect(() => { onLockChange?.(pending || state.status === "outcome_unknown"); }, [pending, state.status, onLockChange]);
  const cards = original?.user_cards && !userCards.some(card => card.id === original.user_card_id) ? [...userCards, original.user_cards] : userCards;
  return <section className={compact ? "ledger-entry" : "ledger-entry ledger-section"}>
    {!compact ? <h2>지출 상세 수정</h2> : null}
    {original ? <TransactionCalculationSummary transaction={original} /> : null}
    <p className="workspace-note">원본 version {String(original?.version ?? "신규")} · 계산 근거 owner revision {String(original?.workspace?.ownerRevision ?? "확인 필요")}. 다른 항목을 수정해도 기존 보정 원문은 유지됩니다.</p>
    <form action={formAction} onSubmit={onSubmit} noValidate={state.status === "outcome_unknown"}>
      <LedgerRequestFields version={original?.version} month={selectedMonth} create={!original} state={state} />
      <input type="hidden" name="originalAmount" value={String(original?.amount ?? "")} />
      <input type="hidden" name="originalLocalOccurredAt" value={occurredAt} />
      <input type="hidden" name="timezoneOffset" value="-540" />
      <fieldset disabled={blocked || pending || complete || state.status === "outcome_unknown"}>
        <div className="ledger-fields">
          <label>금액<input name="amount" inputMode="decimal" defaultValue={original?.amount ?? ""} required /></label>
          <label>사용처<input name="merchantName" defaultValue={original?.merchant_name ?? ""} required maxLength={200} /></label>
          <label>사용 일시 · 한국 시간<input name="occurredAt" type="datetime-local" defaultValue={occurredAt} required={Boolean(occurredAt)} /></label>
          <label>결제수단<select name="paymentMethod" defaultValue={original?.payment_method ?? "credit_card"}>{paymentMethodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>결제 카드<select name="userCardId" defaultValue={original?.user_card_id ?? defaultUserCardId ?? ""}><option value="">카드 미선택</option>{cards.map(card => <option key={card.id} value={card.id}>{card.alias || card.card.name}{card.archived_at ? " (보관)" : ""}</option>)}</select></label>
          <label>카테고리<select name="ledgerCategory" defaultValue={original?.ledger_category ?? ""}><option value="">선택 안 함</option>{original?.ledger_category && !ledgerCategories.some(category => category === original.ledger_category) ? <option value={original.ledger_category}>{original.ledger_category}</option> : null}{ledgerCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
        </div>
        {original && !occurredAt ? <p className="ledger-preserved">날짜 확인 필요 · 원문 {original.occurred_at}. 날짜를 선택하지 않으면 원문을 유지합니다.</p> : null}
        <PaymentDetailsFields transaction={original} />
        <label className="ledger-check"><input name="isFixedCost" type="checkbox" defaultChecked={original?.is_fixed_cost ?? false} />고정비</label>
        <label>메모<input name="memo" defaultValue={original?.memo ?? ""} maxLength={2000} /></label>
        {original?.origin === "legacy" ? <p className="workspace-note">기존 소수 금액 원문은 수정하지 않으면 그대로 보존합니다. 새 금액은 정수 원 단위만 지원합니다.</p> : null}
      </fieldset>
      <LedgerActionFeedback state={state} />
      {state.feedback ? <p className="workspace-note">혜택 {state.feedback.benefit} · 실적 반영 {state.feedback.performance}<br />{state.feedback.notice}</p> : null}
      <button type="submit" className="ledger-submit" disabled={blocked || pending || complete}>{pending ? "저장 중…" : state.status === "outcome_unknown" ? "같은 요청 재시도" : complete ? "저장됨 · 최신 자료로 다시 열기" : "지출 저장"}</button>
    </form>
  </section>;
}
