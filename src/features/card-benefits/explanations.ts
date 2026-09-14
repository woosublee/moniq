import type { BenefitCalculationResult } from "@/features/card-benefits/types";
import type { TransactionRecord } from "@/features/transactions/types";

import { formatWon, getTransactionAmounts } from "@/lib/card-workspace/view-model";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";

const moneyFormatter = new Intl.NumberFormat("ko-KR");
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

type CalculationSnapshot = Record<string, unknown>;

export function buildBenefitExplanation(result: BenefitCalculationResult) {
  if (result.calculationStatus === "unsupported_card") {
    return ["이 카드는 아직 혜택 계산을 지원하지 않습니다."];
  }

  if (result.calculationStatus === "no_matching_rule") {
    return ["적용 가능한 혜택이 없습니다."];
  }

  if (result.performanceExclusionReason) {
    return [`실적 제외: ${result.performanceExclusionReason}`];
  }

  if (!result.rule || result.benefitAmount <= 0) {
    return ["혜택 금액이 계산되지 않았습니다."];
  }

  return [
    `${result.label} 적용`,
    `혜택 ${moneyFormatter.format(result.benefitAmount)}원`,
    `최종 지출 ${moneyFormatter.format(result.finalAmount)}원`,
  ];
}

export function buildTransactionExplanation(transaction: TransactionRecord) {
  if (transaction.workspace || transaction.owner_id !== DEMO_OWNER_ID) {
    const values = getTransactionAmounts(transaction);
    const projection = transaction.workspace?.projection;
    return [
      `원화 혜택 ${formatWon(values.benefitAmount)}`,
      `최종 지출 ${formatWon(values.finalAmount)}`,
      `실적 인정 ${formatWon(values.eligibleSpendAmount)}`,
      ...(projection?.benefits.filter(row => row.unit && row.unit.kind !== "won").map(row => `${row.key}: ${row.appliedAmount ?? "확인 필요"} ${row.unit?.kind}`) ?? []),
      ...(projection?.reasons.length ? ["계산 확인 필요"] : []),
      ...(projection && (projection.unallocatedAnnotations.length || projection.unresolvedAnnotations.length) ? ["배분·검토 필요 (기존 원문 보존)"] : []),
    ];
  }
  return buildLegacyTransactionExplanation(transaction);
}

/** Explicit comparison/history only; never used in live-owner totals. */
export function buildLegacyTransactionExplanation(transaction: TransactionRecord) {
  const snapshot = transaction.transaction_benefit_applications?.[0]?.calculation_snapshot ?? {};
  const benefitAmount = toMoney(transaction.benefit_amount);
  const finalAmount = toMoney(getSnapshotNumber(snapshot, "finalAmount") ?? transaction.final_amount);
  const eligibleSpendAmount = toMoney(
    getSnapshotNumber(snapshot, "eligibleSpendAmount") ?? transaction.eligible_spend_amount,
  );
  const performanceExclusionReason =
    transaction.performance_exclusion_reason || getSnapshotString(snapshot, "performanceExclusionReason");
  const lines: string[] = [];

  if (performanceExclusionReason) {
    lines.push(`실적 제외: ${performanceExclusionReason}`);
  } else if (transaction.calculation_status === "unsupported_card") {
    lines.push("이 카드는 아직 혜택 계산을 지원하지 않습니다.");
  } else if (transaction.calculation_status === "no_matching_rule") {
    lines.push("적용 가능한 혜택이 없습니다.");
  } else if (transaction.calculation_status === "missing_performance") {
    lines.push("전월 실적 조건을 충족하지 않아 혜택이 적용되지 않았습니다.");
  } else if (transaction.calculation_status === "manual_override") {
    lines.push("수동으로 입력한 혜택입니다.");
  } else if (benefitAmount > 0) {
    lines.push(`${getRuleName(transaction, snapshot)} 적용`);
  } else {
    lines.push("혜택 금액이 계산되지 않았습니다.");
  }

  if (benefitAmount > 0) {
    lines.push(`${buildBenefitDetail(snapshot, transaction)}혜택 ${moneyFormatter.format(benefitAmount)}원`);
  }

  lines.push(`최종 지출 ${moneyFormatter.format(finalAmount)}원`);

  if (performanceExclusionReason || !transaction.is_performance_eligible) {
    lines.push("실적 인정 0원");
  } else {
    lines.push(`실적 인정 ${moneyFormatter.format(eligibleSpendAmount)}원`);
  }

  return lines;
}

function getRuleName(transaction: TransactionRecord, snapshot: CalculationSnapshot) {
  return (
    getSnapshotString(snapshot, "ruleName") ||
    transaction.transaction_benefit_applications?.[0]?.label ||
    transaction.benefit_label ||
    "카드 혜택"
  );
}

function buildBenefitDetail(snapshot: CalculationSnapshot, transaction: TransactionRecord) {
  const benefitKind = getSnapshotString(snapshot, "benefitKind");
  const calculationMethod = getSnapshotString(snapshot, "calculationMethod");
  const rate = getSnapshotNumber(snapshot, "rate");
  const fixedAmount = getSnapshotNumber(snapshot, "fixedAmount");
  const kindLabel = getBenefitKindLabel(benefitKind);

  if (calculationMethod === "percent" && rate !== null && rate > 0) {
    return `${kindLabel} ${percentFormatter.format(rate * 100)}% · `;
  }

  if (calculationMethod === "fixed_amount" && fixedAmount !== null && fixedAmount > 0) {
    return `${kindLabel} ${moneyFormatter.format(fixedAmount)}원 · `;
  }

  if (transaction.calculation_status === "manual_override" && transaction.benefit_label) {
    return `${transaction.benefit_label} · `;
  }

  return "";
}

function getBenefitKindLabel(value: string | null) {
  if (value === "cashback") {
    return "캐시백";
  }

  if (value === "points") {
    return "포인트";
  }

  if (value === "statement_credit") {
    return "청구할인";
  }

  return "할인";
}

function getSnapshotString(snapshot: CalculationSnapshot, key: string) {
  const value = snapshot[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function getSnapshotNumber(snapshot: CalculationSnapshot, key: string) {
  const value = snapshot[key];
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;

  return Number.isFinite(number) ? number : null;
}

function toMoney(value: number | string | null | undefined) {
  return Number(value) || 0;
}
