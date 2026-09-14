import { formatWon, getTransactionAmounts, getTransactionBenefitLabel, getCardBenefitLabel, type CardWorkspace } from "@/lib/card-workspace/view-model";
import type { CardPerformanceSummary } from "@/features/card-benefits/types";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionRecord } from "@/features/transactions/types";
import type { CardsQuery } from "@/features/cards/workspace-view";
import { CardSupportBadge } from "./card-support-badge";
import { PerformanceCardList } from "./performance-card-list";
import { BenefitCardList } from "./benefit-card-list";
import { CardMonthInputForm, CardQuotaMonthInputForm } from "./card-month-input-form";
import { CardTargetForm } from "./card-target-form";
import { cardInputOptions, transactionEditorContext } from "@/lib/card-workspace/input-options";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import { TransactionCalculationSummary } from "@/components/transactions/transaction-calculation-summary";
import { LocalDate } from "@/components/transactions/local-date";

export function CardPerformanceDetail({ userCard, transactions, summary, workspace, state, canMutate = false, synthetic = false }: {
  userCard: UserCardRecord; transactions: TransactionRecord[]; summary: CardPerformanceSummary | null; workspace?: CardWorkspace; state?: CardsQuery; canMutate?: boolean; synthetic?: boolean;
}) {
  const options = workspace && summary ? cardInputOptions(workspace, summary) : null;
  return <div className="ledger-detail">
    {workspace && summary && state ? <>
      <PerformanceCardList workspace={workspace} summaries={[summary]} state={state} />
      <CardTargetForm key={`${userCard.id}:${userCard.version}:${state.month}`} card={userCard} targets={options!.targets} month={state.month} readOnly={!canMutate} />
      <section className="ledger-section"><h2>전월 총실적과 자료 상태</h2><p className="workspace-note">범위별 실제 적용 판본과 직접 합산 대상을 사용합니다. 월말 판본으로 이전 구간을 대체하지 않습니다.</p>
        {options!.performance.length ? options!.performance.map(input => <CardMonthInputForm key={`${input.month}:${input.instanceKey}:${input.definition.key}`} input={input} month={state.month} readOnly={!canMutate} />) : <p>확인 필요 · 검증된 실적 범위나 해당 월 자료가 없어 총실적 입력 대상을 정할 수 없습니다.</p>}
      </section>
      {summary.manualTotalMismatches?.map(item => <p key={`${item.month}:${item.scopeKey}`} className="ledger-preserved">{item.month} {item.scopeKey} · 수동 총액 {formatWon(item.amount)} / 원장 {formatWon(item.ledgerAmount)}. 수동값은 유지됩니다. 차이를 재확인해 주세요.</p>)}
      <section className="ledger-section"><h2>월 한도 자료</h2>{options!.quotas.length ? options!.quotas.map(input => <CardQuotaMonthInputForm key={`${input.month}:${input.instanceKey}:${input.quota.scopeKey}:${input.existing?.id ?? "new"}:${input.existing?.version ?? "new"}`} input={input} month={state.month} readOnly={!canMutate} />) : <p className="workspace-note">계산된 한도 범위가 없습니다. 검증된 월별·일별 한도가 있는 거래를 입력한 뒤 해당 월 자료를 확인할 수 있습니다. 일별 한도는 입력 완료·자료 모름만 지원하며 일별 시작 잔여 자료는 지원하지 않습니다.</p>}</section>
      <h2>이번 달 혜택</h2><BenefitCardList workspace={workspace} summaries={[summary]} state={state} synthetic={synthetic} />
      <details className="workspace-provenance"><summary>적용 약관 출처</summary>{workspace.inputs.ruleVersions.filter(rule => rule.card_id === userCard.card_id && (rule.id === summary.workspace?.ruleVersionId || transactions.some(row => row.workspace?.projection.ruleVersionId === rule.id))).map(rule => <p key={rule.id}>{rule.version_label} · {rule.effective_from ?? "기간 미검증"}{rule.source_url ? <> · <a href={rule.source_url} target="_blank" rel="noreferrer">약관 원문</a></> : " · 출처 확인 필요"}</p>)}</details>
    </> : <><section className="ledger-section"><h2>{userCard.card.name}</h2><CardSupportBadge status={userCard.card.benefit_support_status} card={userCard.card} /><p>이번 달 혜택 {getCardBenefitLabel(summary)}</p></section></>}
    <section className="ledger-section"><h2>최근 거래</h2><p className="workspace-note">선택 월 {transactions.length}건 · 결제 원금과 혜택·실적 인정/제외 사유</p>
      {transactions.slice(0, 10).map(row => <article className="activity-entry" key={row.id}>
        <div className="activity-entry-top"><h3>{row.merchant_name}</h3><strong>{formatWon(getTransactionAmounts(row).actualAmount)}</strong></div>
        <p className="workspace-note"><LocalDate value={row.occurred_at} /> · 혜택 {getTransactionBenefitLabel(row)}</p>
        <details className="ledger-auxiliary"><summary>인정·제외와 계산 근거</summary><TransactionCalculationSummary transaction={row} /></details>
        {workspace ? <TransactionEditDialog transaction={row} userCards={workspace.inputs.cards.slice()} context={transactionEditorContext(workspace, row)} month={state?.month} readOnly={!canMutate} trigger="거래 상세" triggerClassName="workspace-text-link" /> : null}
      </article>)}
    </section>
  </div>;
}
