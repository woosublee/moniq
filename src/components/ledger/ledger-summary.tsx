import type { HouseholdTotals } from "@/features/ledger/workspace-view";
import { formatWon } from "@/lib/card-workspace/view-model";

export function LedgerSummary({ totals, label }: { totals: HouseholdTotals; label: string }) {
  return <section className="household-summary" aria-label={label}>
    <h2>{label}</h2>
    <dl>{[["수입", totals.incomeAmount], ["지출", totals.expenseAmount], ["차액", totals.differenceAmount]].map(([name, value]) => <div key={String(name)}><dt>{name}</dt><dd>{formatWon(value)}</dd></div>)}</dl>
  </section>;
}
