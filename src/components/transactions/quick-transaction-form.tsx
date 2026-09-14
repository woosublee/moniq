"use client";
import { useEffect, useRef, useState } from "react";
import { LedgerActionFeedback, LedgerRequestFields, useLedgerActionState } from "./ledger-request-fields";
import { createIncome, createTransaction } from "@/app/transactions/new/actions";
import { EntryPrimaryFields } from "@/components/ledger/income-fields";
import { PaymentDetailsFields } from "./payment-details-fields";
import type { UserCardRecord } from "@/features/cards/types";
import { initialTransactionFormState, ledgerCategories } from "@/features/transactions/constants";
import type { TransactionFormState } from "@/features/transactions/types";

type FormAction = (previous: TransactionFormState, data: FormData) => Promise<TransactionFormState>;
export type QuickTransactionFormProps = {
  userCards?: UserCardRecord[]; defaultUserCardId: string | null; compact?: boolean; month?: string;
  onSuccess?: () => void; onLockChange?: (locked: boolean) => void; action?: FormAction;
  /** Opt in from the household consumer; existing card/expense callers stay unchanged. */
  allowIncome?: boolean; incomeSupported?: boolean; incomeAction?: FormAction;
};
export function QuickTransactionForm({ userCards = [], defaultUserCardId, compact = false, month, onSuccess, onLockChange, action, allowIncome = false, incomeSupported = false, incomeAction }: QuickTransactionFormProps) {
  // Native defaultSelected and React must share the same mounted reset source.
  // Fresh parent defaults must not change this form's input/request snapshot.
  const [resetCardId] = useState(defaultUserCardId ?? "");
  const [selectedCardId, setSelectedCardId] = useState(resetCardId);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("");
  // The mounted action selects by the captured FormData, never by a stale kind
  // closure. The existing controller owns UUIDs, frozen retries and submission.
  const [state, formAction, pending, onSubmit, blocked] = useLedgerActionState(
    (previous, data) => data.get("entryKind") === "income" ? (incomeAction ?? createIncome)(previous, data) : (action ?? createTransaction)(previous, data),
    initialTransactionFormState, { create: true, month },
  );
  const form = useRef<HTMLFormElement>(null);
  const [date] = useState(() => {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    return month && !today.startsWith(month) ? `${month}-01` : today;
  });
  const lastCompleted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if ((state.status === "success" || state.status === "saved_needs_review") && state.requestId !== lastCompleted.current) {
      lastCompleted.current = state.requestId;
      form.current?.reset();
      onSuccess?.();
    }
  }, [state.status, state.requestId, onSuccess]);
  useEffect(() => { onLockChange?.(pending || state.status === "outcome_unknown"); }, [pending, state.status, onLockChange]);
  const locked = blocked || pending || state.status === "outcome_unknown";
  const income = kind === "income";
  const unsupported = income && !incomeSupported && state.status !== "outcome_unknown";
  const categories: readonly string[] = income ? ["급여", "부수입", "용돈", "이자", "기타 수입"] : ledgerCategories;
  return <section className={compact ? "ledger-entry" : "ledger-entry ledger-section"}>
    {!compact ? <header><h2>{allowIncome ? "내역 입력" : "빠른 지출 입력"}</h2><p className="workspace-note">{allowIncome ? "날짜, 내용, 금액을 입력하세요. 지출에는 결제수단을 함께 기록합니다." : "사용처, 카드, 금액, 날짜만 입력하세요. 필요한 결제 조건은 아래에서 추가할 수 있습니다."}</p></header> : null}
    <form ref={form} action={formAction} onSubmit={event => {
      if (unsupported) { event.preventDefault(); return; }
      onSubmit(event);
    }} onReset={event => {
      if (!event.defaultPrevented && (state.status === "success" || state.status === "saved_needs_review")) {
        setSelectedCardId(resetCardId); setKind("expense"); setCategory("");
      }
    }} noValidate={state.status === "outcome_unknown"}>
      <LedgerRequestFields create month={month} state={state} />
      {!income ? <input type="hidden" name="paymentMethod" value={selectedCardId === "cash" || selectedCardId === "points" ? selectedCardId : userCards.find(card => card.id === selectedCardId)?.card.card_type ?? "credit_card"} /> : null}
      <fieldset disabled={locked}>
        {allowIncome || income ? <div className="ledger-kind" role="group" aria-label="내역 종류">
          <label><input type="radio" name="entryKind" value="expense" checked={!income} onChange={() => setKind("expense")} />지출</label>
          <label><input type="radio" name="entryKind" value="income" checked={income} onChange={() => setKind("income")} disabled={!incomeSupported} />수입</label>
        </div> : null}
        {allowIncome && !incomeSupported ? <p className="ledger-preserved">수입 기능 적용 필요 · 지출은 계속 기록할 수 있습니다.</p> : null}
        <EntryPrimaryFields kind={kind} date={date}>
          {!income ? <label>카드<select name="userCardId" value={selectedCardId} onChange={event => setSelectedCardId(event.target.value)} required><option value="">카드 또는 현금을 선택하세요</option><option value="cash">현금</option><option value="points">포인트 결제</option>{userCards.filter(card => !card.archived_at).map(card => <option key={card.id} value={card.id}>{card.alias || `${card.card.issuer} ${card.card.name}`}</option>)}</select></label> : null}
        </EntryPrimaryFields>
        {!income ? <PaymentDetailsFields includeTime /> : null}
        <details className="ledger-auxiliary"><summary>{income ? "분류·메모" : "분류·고정비·메모"}</summary>
          <label>카테고리<select name="ledgerCategory" value={category} onChange={event => setCategory(event.target.value)}><option value="">선택 안 함</option>{category && !categories.includes(category) ? <option value={category}>{category}</option> : null}{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          {!income ? <label className="ledger-check"><input type="checkbox" name="isFixedCost" />고정비</label> : null}
          <label>메모<input name="memo" maxLength={2000} /></label>
        </details>
      </fieldset>
      <LedgerActionFeedback state={state} />
      {!income && state.feedback ? <dl className="ledger-feedback"><div>예상 혜택 {state.feedback.benefit}</div><div>실적 반영 {state.feedback.performance}</div><div>추가 확인 사항 {state.feedback.notice}</div></dl> : null}
      <button type="submit" className="ledger-submit" disabled={blocked || pending || unsupported}>{pending ? "저장 중…" : state.status === "outcome_unknown" ? "같은 요청 재시도" : income ? "수입 저장" : "지출 저장"}</button>
    </form>
  </section>;
}
