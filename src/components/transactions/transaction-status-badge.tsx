import type { TransactionCalculationStatus } from "@/features/transactions/types";

const labels: Record<TransactionCalculationStatus, string> = {
  calculated: "자동 계산",
  unsupported_card: "계산 미지원",
  no_matching_rule: "혜택 없음",
  missing_performance: "실적 부족",
  manual_override: "수동 수정",
};

export function TransactionStatusBadge({ status }: { status: TransactionCalculationStatus }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
      {labels[status]}
    </span>
  );
}
