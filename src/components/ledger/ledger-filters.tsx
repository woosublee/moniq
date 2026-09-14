import Link from "next/link";
import Form from "next/form";
import type { UserCardRecord } from "@/features/cards/types";
import { shiftMonth } from "@/features/card-benefits/periods";
import { ledgerQueryEndMonth, ledgerQueryHref, type LedgerQuery } from "@/features/ledger/workspace-view";

export type HouseholdView = "/ledger" | "/dashboard";
export function householdHref(state: LedgerQuery, view: HouseholdView, patch: Partial<LedgerQuery> = {}) {
  return ledgerQueryHref(state, patch).replace("/ledger", view);
}
function FilterFields({ state }: { state: LedgerQuery }) {
  return <>{["query", "category", "paymentMethod", "card", "kind"].map(key => <input key={key} type="hidden" name={key} value={String(state[key as keyof LedgerQuery])} />)}</>;
}
export function LedgerPeriod({ state, view }: { state: LedgerQuery; view: HouseholdView }) {
  const month = ledgerQueryEndMonth(state);
  const [year, monthNumber] = month.split("-").map(Number);
  const label = state.period.kind === "month" ? `${year}년 ${monthNumber}월` : `${state.period.startDate} ~ ${state.period.endDate}`;
  return <div className="household-period">
    {month > "0001-01" ? <Link aria-label="이전 달" href={householdHref(state, view, { period: { kind: "month", month: shiftMonth(month, -1) } })}>‹</Link> : <span />}
    <details key={ledgerQueryHref(state)} className="household-period-picker"><summary aria-label="월·기간 선택">{label}</summary><div className="household-period-popover">
      <Form action={view}><FilterFields state={state} /><label>조회 월<input type="month" name="month" defaultValue={month} min="0001-01" max="9999-12" required /></label><button type="submit">월 적용</button></Form>
      <Form action={view}><FilterFields state={state} /><label>시작일<input type="date" name="startDate" defaultValue={state.period.kind === "range" ? state.period.startDate : `${month}-01`} min="0001-01-01" max="9999-12-31" required /></label><label>종료일<input type="date" name="endDate" defaultValue={state.period.kind === "range" ? state.period.endDate : `${month}-${new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()}`} min="0001-01-01" max="9999-12-31" required /></label><button type="submit">기간 적용</button></Form>
    </div></details>
    {month < "9999-12" ? <Link aria-label="다음 달" href={householdHref(state, view, { period: { kind: "month", month: shiftMonth(month, 1) } })}>›</Link> : <span />}
  </div>;
}
export function LedgerFilters({ state, view, userCards }: { state: LedgerQuery; view: HouseholdView; userCards: UserCardRecord[] }) {
  return <Form action={view} key={ledgerQueryHref(state)} className="household-filters" aria-label="내역 필터">
    {state.period.kind === "month" ? <input type="hidden" name="month" value={state.period.month} /> : <><input type="hidden" name="startDate" value={state.period.startDate} /><input type="hidden" name="endDate" value={state.period.endDate} /></>}
    <label className="household-search"><span className="sr-only">내역 검색</span><input name="query" defaultValue={state.query} placeholder="내용·분류·카드 검색" maxLength={200} /></label>
    <label className="household-kind-filter"><span className="sr-only">내역 종류</span><select name="kind" defaultValue={state.kind}><option value="all">전체 종류</option><option value="expense">지출</option><option value="income">수입</option><option value="refund">환불</option></select></label>
    <details className="household-filter-details" open={Boolean(state.category || state.paymentMethod || state.card)}><summary>분류·결제수단 필터</summary><div>
      <label>분류<input name="category" defaultValue={state.category} placeholder="전체 분류" maxLength={120} /></label>
      <label>결제수단<select name="paymentMethod" defaultValue={state.paymentMethod}><option value="">모든 결제</option><option value="cash">현금</option><option value="credit_card">신용카드</option><option value="check_card">체크카드</option><option value="points">포인트</option></select></label>
      <label>결제 카드<select name="card" defaultValue={state.card}><option value="">모든 카드</option>{state.card && !userCards.some(card => card.id === state.card) ? <option value={state.card}>선택한 카드 (확인 필요)</option> : null}{userCards.map(card => <option key={card.id} value={card.id}>{card.alias || card.card.name}{card.archived_at ? " (보관)" : ""}</option>)}</select></label>
    </div></details>
    <button type="submit">필터 적용</button>
    {state.query || state.category || state.paymentMethod || state.card || state.kind !== "all" ? <Link href={householdHref(state, view, { query: "", category: "", paymentMethod: "", card: "", kind: "all" })}>필터 초기화</Link> : null}
  </Form>;
}
