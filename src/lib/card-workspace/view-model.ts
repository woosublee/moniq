import type { ReplayInputs, ReplayResult, ReplayTransaction, UnitTotal } from "@/features/card-benefits/engine-types";
import type { CardPerformanceSummary, RevisionValue } from "@/features/card-benefits/types";
import { readIntegerAmount } from "@/features/card-benefits/money";
import { finalPaidAmount } from "@/features/card-benefits/performance";
import { sumAmounts, summarizeBenefits } from "@/features/card-benefits/summaries";
import { buildBenefitDisplay, formatBenefitDisplay, type BenefitDisplay } from "./benefit-display";
import { parseSeoulInstant, type MonthKey } from "@/features/card-benefits/periods";
import type { TransactionRecord } from "@/features/transactions/types";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";

export type WorkspaceTransactionValues = {
  ownerRevision: RevisionValue;
  projection: ReplayTransaction;
  actualAmount: number | null;
  finalAmount: number | null;
  /** Won-only compatibility value; use benefitDisplay for a complete reward label. */
  benefitAmount: number | null;
  benefitDisplay: BenefitDisplay;
  eligibleSpendAmount: number | null;
};
export function sumKnown(values: readonly (number | null)[]): number | null {
  return sumAmounts(values.map((amount) => ({ amount, reasons: [] }))).amount;
}
export function formatWon(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "확인 필요";
  // Raw source decimals are displayed verbatim, never rounded into supported KRW.
  if (typeof value === "string" && readIntegerAmount(value) === null) return `${value}원`;
  const integer = typeof value === "number" && Number.isSafeInteger(value) ? value : readIntegerAmount(value);
  return integer === null ? "확인 필요" : `${new Intl.NumberFormat("ko-KR").format(integer)}원`;
}
function wonTotal(units: readonly UnitTotal[]): number | null {
  if (units.some((unit) => unit.unit === null)) return null;
  return sumKnown(units.filter((unit) => unit.unit?.kind === "won").map((unit) => unit.amount));
}
export function getTransactionAmounts(transaction: TransactionRecord) {
  if (transaction.workspace) return transaction.workspace;
  // Only the explicitly separate synthetic demo may display legacy fixture values.
  if (transaction.owner_id === DEMO_OWNER_ID) return {
    actualAmount: readIntegerAmount(transaction.actual_amount), finalAmount: readIntegerAmount(transaction.final_amount),
    benefitAmount: readIntegerAmount(transaction.benefit_amount), eligibleSpendAmount: readIntegerAmount(transaction.eligible_spend_amount),
  };
  return { actualAmount: readIntegerAmount(transaction.actual_amount), finalAmount: null, benefitAmount: null, eligibleSpendAmount: null };
}
export function getTransactionBenefitLabel(transaction: TransactionRecord): string {
  return transaction.workspace ? formatBenefitDisplay(transaction.workspace.benefitDisplay) : formatWon(getTransactionAmounts(transaction).benefitAmount);
}
export function getCardBenefitLabel(summary: CardPerformanceSummary | null | undefined): string {
  return summary?.benefitDisplay ? formatBenefitDisplay(summary.benefitDisplay) : formatWon(summary?.benefitAmount);
}
export function summarizeTransactions(transactions: readonly TransactionRecord[]) {
  const values = transactions.map(getTransactionAmounts);
  return {
    actualAmount: sumKnown(values.map((row) => row.actualAmount)), finalAmount: sumKnown(values.map((row) => row.finalAmount)),
    benefitAmount: sumKnown(values.map((row) => row.benefitAmount)), eligibleSpendAmount: sumKnown(values.map((row) => row.eligibleSpendAmount)),
    fixedCostAmount: sumKnown(transactions.filter((row) => row.is_fixed_cost).map((row) => getTransactionAmounts(row).finalAmount)),
    benefitCount: values.filter((row) => row.benefitAmount !== null && row.benefitAmount > 0).length,
  };
}
export function buildCardWorkspace(inputs: ReplayInputs, ownerRevision: RevisionValue, throughMonth: MonthKey, replay: ReplayResult) {
  const sources = new Map(inputs.transactions.map((source) => [source.id, source]));
  const cards = new Map(inputs.cards.map((card) => [card.id, card]));
  const transactions: TransactionRecord[] = replay.transactions.map((projection) => {
    const source = sources.get(projection.id)!;
    const ownedRecognitions = projection.recognized.filter((scope) => scope.targetCardId === source.user_card_id);
    // Recognition-only uncertainty is not a benefit dependency. Replay already marks
    // an affected benefit's appliedAmount unknown when it actually depends on that scope.
    const benefitUnknown = projection.reasons.some((reason) => ["policy_unverified", "invalid_policy", "unit_unknown", "refund_policy_unknown"].includes(reason))
      || projection.unallocatedAnnotations.some(note => note.target_kind !== "performance");
    const benefitDisplay = buildBenefitDisplay(summarizeBenefits(projection.benefits), projection.benefits, benefitUnknown);
    const benefitAmount = benefitDisplay.complete ? wonTotal(benefitDisplay.totals) : null;
    const finalAmount = benefitUnknown ? null : finalPaidAmount({ amount: projection.netAmount, reasons: projection.reasons }, projection.benefits).amount;
    return { ...source, user_cards: source.user_card_id ? cards.get(source.user_card_id) ?? null : null,
      workspace: { ownerRevision, projection, actualAmount: source.input_excluded ? 0 : readIntegerAmount(source.actual_amount), finalAmount,
        benefitAmount, benefitDisplay, eligibleSpendAmount: source.input_excluded ? 0 : !source.user_card_id ? 0 : ownedRecognitions.length === 1 ? ownedRecognitions[0].appliedAmount : null } };
  });
  const selected = replay.months.find((month) => month.month === throughMonth)!;
  const summaries: CardPerformanceSummary[] = selected.cards.map((summary) => {
    const scope = summary.performance.length === 1 ? summary.performance[0] : null;
    const cardRows = transactions.filter(row => !row.input_excluded && row.user_card_id === summary.userCardId && row.workspace?.projection.month === throughMonth);
    const benefitDisplay = buildBenefitDisplay(summary.benefits, cardRows.flatMap(row => row.workspace!.projection.benefits),
      summary.requirementStatus === "unverified" || cardRows.some(row => !row.workspace!.benefitDisplay.complete));
    return { userCard: cards.get(summary.userCardId)!, requirement: null,
      eligibleSpendAmount: scope?.amount ?? null,
      requiredSpendAmount: scope?.amount !== null && scope?.amount !== undefined && scope.remaining !== null ? scope.amount + scope.remaining : null,
      remainingSpendAmount: scope?.remaining ?? null,
      benefitAmount: benefitDisplay.complete ? wonTotal(summary.benefits) : null,
      benefitDisplay,
      status: summary.requirementStatus === "no_requirement" ? "no_requirement" : !scope || scope.amount === null ? "missing" : scope.tierKey ? "met" : "unmet",
      workspace: summary,
      manualTotalMismatches: replay.months.flatMap(({ month, cards }) => cards.filter(card => card.userCardId === summary.userCardId).flatMap(card => card.performance.filter(scope => scope.reasons.includes("manual_total_mismatch")).map(scope => ({ month, scopeKey: scope.scopeKey, amount: scope.amount, ledgerAmount: scope.ledgerAmount })))) };
  });
  const visibleTransactions = transactions.filter((row) => !row.input_excluded && row.workspace?.projection.month === throughMonth);
  const cardCash = sumKnown(selected.cards.map((card) => card.cashFlow.amount));
  const nonCardCash = sumKnown([
    ...visibleTransactions.filter((row) => !row.user_card_id).map((row) => readIntegerAmount(row.actual_amount)),
    ...inputs.adjustments.filter((refund) => !refund.voided_at && !sources.get(refund.transaction_id)?.user_card_id && !sources.get(refund.transaction_id)?.input_excluded && seoulMonth(refund.occurred_at) === throughMonth)
      .map((refund) => { const amount = readIntegerAmount(refund.amount); return amount === null ? null : -amount; }),
  ]);
  return { ownerId: inputs.ownerId, ownerRevision, throughMonth, inputs, replay, transactions, summaries,
    totals: { ...summarizeTransactions(visibleTransactions), cashFlowAmount: sumKnown([cardCash, nonCardCash]) } };
}
export type CardWorkspace = ReturnType<typeof buildCardWorkspace>;
export function seoulMonth(instant: string): string | null {
  return parseSeoulInstant(instant)?.month ?? null;
}
export function currentSeoulMonth(): MonthKey { return seoulMonth(new Date().toISOString()) as MonthKey; }
