import { resolvePerformanceData } from "./month-inputs";
import { readIntegerAmount } from "./money";
import type { CardMonthInputRecord } from "./types";
import type { PolicyScope, ReplayAmount, ReplayBenefit, ReplayReason, ScopeSummary, UnitTotal, RewardUnit } from "./engine-types";

export const reasons = (...lists: readonly ReplayReason[][]): ReplayReason[] => [...new Set(lists.flat())].sort();
export const knownAmount = (amount: number): ReplayAmount => ({ amount, reasons: [] });
export const unknownAmount = (...why: ReplayReason[]): ReplayAmount => ({ amount: null, reasons: reasons(why) });
export function sumAmounts(values: readonly ReplayAmount[]): ReplayAmount {
  const why = reasons(...values.map((value) => value.reasons));
  if (values.some((value) => value.amount === null)) return { amount: null, reasons: why };
  const sum = values.reduce((total, value) => total + BigInt(value.amount!), BigInt(0));
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(-Number.MAX_SAFE_INTEGER)) return unknownAmount("precision_unknown");
  return { amount: Number(sum), reasons: why };
}
export function unitKey(unit: RewardUnit | null): string {
  return !unit ? "unknown" : unit.kind === "won" ? "won" : `${unit.kind}:${unit.program}`;
}
export function summarizeBenefits(benefits: readonly ReplayBenefit[]): UnitTotal[] {
  const groups = new Map<string, { unit: RewardUnit | null; values: ReplayAmount[] }>();
  for (const benefit of benefits) {
    const key = unitKey(benefit.unit);
    const group = groups.get(key) ?? { unit: benefit.unit, values: [] };
    group.values.push({ amount: benefit.appliedAmount, reasons: benefit.appliedAmount === null ? benefit.reasons : [] });
    groups.set(key, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => ({ unit: group.unit, ...sumAmounts(group.values) }));
}
export function summarizePerformance(scope: PolicyScope, instanceKey: string, ledger: ReplayAmount, data: CardMonthInputRecord | null, targetTierKey: string | null = null): ScopeSummary {
  const stored = data?.scope_kind === "performance" ? data.data_status === "manual_total" ? { status: data.data_status, amount: data.amount } as const : { status: data.data_status } : null;
  const resolved = resolvePerformanceData({ verification: "verified", performance: { kind: "previous_month", scopeKey: scope.key } }, stored, ledger.amount);
  const amount = resolved.status === "known" ? readIntegerAmount(resolved.total) : null;
  const why: ReplayReason[] = amount === null ? resolved.status === "known" ? ["precision_unknown"] : reasons(["missing_performance"], ledger.reasons) : [];
  if (stored?.status === "manual_total" && amount !== null && ledger.amount !== null && amount !== ledger.amount) why.push("manual_total_mismatch");
  const achieved = amount === null ? null : [...scope.tiers].reverse().find((tier) => amount >= tier.minimumSpend) ?? null;
  const next = amount === null ? null : scope.tiers.find((tier) => tier.minimumSpend > amount) ?? null;
  const target = scope.tiers.find((tier) => tier.key === targetTierKey);
  return {
    scopeKey: scope.key, scopeInstanceKey: instanceKey, ledgerAmount: ledger.amount, amount,
    source: resolved.status === "known" ? resolved.source : null,
    status: amount === null ? "missing" : amount === 0 ? "known_zero" : !achieved ? "unmet" : !next ? "highest_tier" : "met",
    tierKey: achieved?.key ?? null, nextTierKey: next?.key ?? null, remaining: next && amount !== null ? next.minimumSpend - amount : amount !== null ? 0 : null,
    target: target ? { tierKey: target.key, status: amount === null ? "unknown" : amount >= target.minimumSpend ? "met" : "unmet", remaining: amount === null ? null : Math.max(0, target.minimumSpend - amount) } : null,
    reasons: reasons(why),
  };
}
