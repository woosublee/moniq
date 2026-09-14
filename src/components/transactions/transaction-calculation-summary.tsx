import type { TransactionRecord } from "@/features/transactions/types";
import { formatWon, getTransactionAmounts, getTransactionBenefitLabel } from "@/lib/card-workspace/view-model";
import { formatBenefitDisplay } from "@/lib/card-workspace/benefit-display";
import { readIntegerAmount } from "@/features/card-benefits/money";
import type { RewardUnit } from "@/features/card-benefits/engine-types";
import { WorkspaceReasons } from "@/components/cards/workspace-reasons";

export function rewardValue(value: number | string | null, unit: RewardUnit | null) {
  return formatBenefitDisplay({ complete: true, totals: [{ amount: readIntegerAmount(value), unit, reasons: [], sources: [] }] });
}
export function TransactionCalculationSummary({ transaction, compact = false }: { transaction: TransactionRecord; compact?: boolean }) {
  const values = getTransactionAmounts(transaction);
  if (compact) return <p className="household-card-note"><span>예상 혜택 {getTransactionBenefitLabel(transaction)}</span><span>실적 인정 {formatWon(values.eligibleSpendAmount)}</span></p>;
  const projection = transaction.workspace?.projection;
  const preserved = [...new Map([...(projection?.unresolvedAnnotations ?? []), ...(projection?.unallocatedAnnotations ?? [])].map(note => [note.id, note])).values()];
  return <div className="ledger-calculation">
    <SummaryRow label="결제금액" value={formatWon(values.actualAmount)} />
    <SummaryRow label="혜택" value={getTransactionBenefitLabel(transaction)} />
    <SummaryRow label="최종 지출" value={formatWon(values.finalAmount)} />
    {projection?.recognized.length ? projection.recognized.map(scope => <div key={`${scope.targetCardId}:${scope.scopeKey}:${scope.scopeInstanceKey}`}><SummaryRow label={`실적 인정 · ${scope.scopeKey}`} value={formatWon(scope.appliedAmount)} /><p className="workspace-note">자동 {formatWon(scope.automaticAmount)} · {scope.source === "manual" ? "수동 보정 적용" : "자동 적용"} · {scope.scopeInstanceKey}</p><WorkspaceReasons reasons={scope.reasons} /></div>) : <SummaryRow label="실적 인정" value={formatWon(values.eligibleSpendAmount)} />}
    {projection?.benefits.map(benefit => <details key={benefit.key} className="ledger-auxiliary"><summary>{benefit.key} · 계산과 보정</summary>
      <SummaryRow label="자동 예상" value={rewardValue(benefit.automaticAmount, benefit.unit)} />
      <SummaryRow label="예상 고정" value={benefit.estimatedOverride === null ? "보정 없음" : rewardValue(benefit.estimatedOverride, benefit.unit)} />
      <SummaryRow label="실제 확정" value={benefit.confirmedBenefit === null ? "입력 없음" : rewardValue(benefit.confirmedBenefit, benefit.unit)} />
      <WorkspaceReasons reasons={benefit.reasons} />
    </details>)}
    {preserved.map(note => <div className="ledger-preserved" key={note.id}><p>재확인 필요 · 보정 원문 보존</p><p>대상 {note.target_key ?? "미지정"} · 종류 {note.target_kind} · 원문 금액 {String(note.amount)}{note.scope_instance_key ? ` · 범위 ${note.scope_instance_key}` : ""}</p><p>근거 owner revision {String(note.basis_input_revision ?? "미기록")} · 보정 version {String(note.version)} · 판본 {note.basis_rule_version_id ?? "미기록"}</p><p>현재 대상에 자동 재배분하지 않습니다. 다른 항목을 수정해도 이 값은 유지됩니다.</p></div>)}
    <WorkspaceReasons reasons={projection?.reasons ?? []} />
  </div>;
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="ledger-summary-row"><span>{label}</span><strong>{value}</strong></div>;
}
