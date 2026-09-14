import Link from "next/link";
import Form from "next/form";
import { shiftMonth } from "@/features/card-benefits/periods";
import { cardsHref, type CardsQuery } from "@/features/cards/workspace-view";

export function MonthSelector({ state }: { state: CardsQuery }) {
  const [year, month] = state.month.split("-").map(Number);
  return <div className="workspace-month" aria-label="조회 월">
    {state.month > "0001-01" ? <Link href={cardsHref(state, { month: shiftMonth(state.month, -1) })} aria-label="이전 달" scroll={false}>‹</Link> : <span />}
    <details className="month-picker">
      <summary>{year}년 {month}월</summary>
      <Form action="/cards" className="month-picker-form">
        <input type="hidden" name="tab" value={state.tab} />
        <input type="hidden" name="query" value={state.query} />
        <input type="hidden" name="card" value={state.card} />
        <label>조회할 월<input type="month" name="month" defaultValue={state.month} required /></label>
        <button type="submit">이동</button>
      </Form>
    </details>
    {state.month < "9999-12" ? <Link href={cardsHref(state, { month: shiftMonth(state.month, 1) })} aria-label="다음 달" scroll={false}>›</Link> : <span />}
  </div>;
}
