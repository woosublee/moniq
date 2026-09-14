import type { HouseholdProjection } from "@/features/ledger/workspace-view";
import { formatWon, sumKnown } from "@/lib/card-workspace/view-model";

/** Same filtered projection as the ledger, before its 50-row presentation slice. */
export function DashboardSummary({ projection }: { projection: HouseholdProjection }) {
  const { categoryTotals, filteredTotals } = projection;
  return <section className="household-statistics" aria-label="분류·고정비 통계">
    <h2>분류별 지출</h2>
    <p className="household-note">선택한 월·기간의 검색·필터 전체 기준. 지출은 승인 원금에서 발생일 기준 환불을 뺀 금액입니다.</p>
    <dl className="household-stat-facts"><div><dt>승인 원금</dt><dd>{formatWon(filteredTotals.purchaseAmount)}</dd></div><div><dt>환불</dt><dd>{formatWon(filteredTotals.refundAmount)}</dd></div><div><dt>고정비</dt><dd>{formatWon(sumKnown(categoryTotals.map(row => row.fixedCostAmount)))}</dd></div></dl>
    {categoryTotals.length ? <table aria-label="분류별 지출과 고정비"><thead><tr><th scope="col">분류</th><th scope="col">지출</th><th scope="col">그중 고정비</th></tr></thead><tbody>{categoryTotals.map(row => <tr key={JSON.stringify(row.category)}><th scope="row">{row.category ?? "미분류"}</th><td>{formatWon(row.expenseAmount)}</td><td>{formatWon(row.fixedCostAmount)}</td></tr>)}</tbody></table> : <p className="household-empty">조건에 맞는 지출·환불이 없습니다.</p>}
    <p className="household-note">예상 카드 혜택은 지출·고정비에서 미리 빼지 않습니다. 차액은 수입 − 지출이며 계좌 잔액이 아닙니다.</p>
  </section>;
}
