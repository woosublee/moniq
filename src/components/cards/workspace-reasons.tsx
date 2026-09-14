import type { ReplayReason } from "@/features/card-benefits/engine-types";

const labels: Record<ReplayReason, string> = {
  policy_unverified: "약관 판본이나 적용 기간이 검증되지 않았습니다.", invalid_policy: "등록된 규칙을 확인해야 합니다.",
  missing_performance: "전월 또는 해당 실적 범위의 입력 자료가 부족합니다.", incomplete_data: "이 달의 입력 완료 여부를 확인해야 합니다.",
  precision_unknown: "소수 또는 지원 범위를 벗어난 금액을 확인해야 합니다.", merchant_unknown: "가맹점 분류를 확인해야 합니다.", merchant_ambiguous: "가맹점 후보가 여러 개입니다.",
  channel_unknown: "결제 경로를 확인해야 합니다.", installment_unknown: "할부 정보를 확인해야 합니다.", category_unknown: "거래 분류를 확인해야 합니다.",
  quota_unknown: "월초 사용량 또는 남은 한도 자료가 필요합니다.", quota_definition_conflict: "공유 한도 정의가 서로 다릅니다.", scope_binding_unknown: "실적·한도의 합산 대상을 확인해야 합니다.",
  ordering_unknown: "거래 적용 순서를 확인해야 합니다.", refund_policy_unknown: "환불·한도 복원 규정이 검증되지 않았습니다.", unsupported_condition: "아직 지원하지 않는 적용 조건입니다.",
  cyclic_performance_dependency: "혜택과 실적 계산이 서로를 참조합니다.", unsupported_performance_dependency: "지원하지 않는 실적 계산 의존 관계입니다.", unit_unknown: "혜택 단위 또는 프로그램을 확인해야 합니다.",
  combination_unknown: "혜택 중복 적용 규정을 확인해야 합니다.", annotation_needs_review: "입력한 보정의 검토가 필요합니다.", annotation_allocation_unknown: "보정의 혜택·실적 배분 대상을 확인해야 합니다.",
  manual_total_mismatch: "수동 월 총액과 원장이 다릅니다. 수동값은 유지되며 재확인이 필요합니다.",
};
export function WorkspaceReasons({ reasons, fallback }: { reasons: readonly ReplayReason[]; fallback?: string }) {
  const unique = [...new Set(reasons)];
  if (!unique.length && !fallback) return null;
  return <details className="workspace-reasons"><summary>확인 필요 이유</summary><ul>{unique.map(reason => <li key={reason}>{labels[reason]}</li>)}{!unique.length && fallback ? <li>{fallback}</li> : null}</ul></details>;
}
