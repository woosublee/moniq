import { buildCardWorkspace, getTransactionAmounts, sumKnown, type CardWorkspace } from "./view-model";
import type { TransactionRecord } from "@/features/transactions/types";
import type { CardPerformanceSummary } from "@/features/card-benefits/types";
import type { PolicyScope, RewardUnit, ScopeSummary } from "@/features/card-benefits/engine-types";
import { cardPolicySchema } from "@/features/card-benefits/policy-schema";
import { resolveScopeBinding, selectRuleVersion } from "@/features/card-benefits/scope-bindings";
import { shiftMonth, type MonthKey } from "@/features/card-benefits/periods";
import { readIntegerAmount } from "@/features/card-benefits/money";
import { workspaceBenefitServices, workspacePerformanceScopes, workspaceQuotaGroups } from "@/features/cards/workspace-view";
import { summarizePerformance, unknownAmount } from "@/features/card-benefits/summaries";

export type AnnotationTarget = { kind: "performance" | "benefit"; key: string; instanceKey: string | null; ruleVersionId: string; automaticAmount: number | null; unit: RewardUnit | null };
/** Small editor props, not a client copy of the owner-wide ledger. Audit snapshots never choose targets. */
export function transactionEditorContext(workspace: CardWorkspace, transaction: TransactionRecord) {
  const projection = transaction.workspace?.projection;
  const targets: AnnotationTarget[] = [];
  if (projection?.day && projection.month && !transaction.input_excluded) {
    for (const card of workspace.inputs.cards) {
      const selected = selectRuleVersion(card.card_id, projection.day, workspace.inputs.ruleVersions);
      const parsed = cardPolicySchema.safeParse(selected?.policy_json);
      if (!selected || !parsed.success) continue;
      if (card.id === transaction.user_card_id && selected.id === projection.ruleVersionId) {
        for (const definition of parsed.data.benefits) {
          const applied = projection.benefits.find(item => item.key === definition.key);
          targets.push({ kind: "benefit", key: definition.key, instanceKey: null, ruleVersionId: selected.id, automaticAmount: applied?.automaticAmount ?? null, unit: applied?.unit ?? definition.unit ?? (definition.benefitKind === "points" ? null : { kind: "won" }) });
        }
      }
      for (const definition of parsed.data.performanceScopes) {
        const binding = resolveScopeBinding(workspace.ownerId, card.id, selected.id, "performance", definition.key, definition.contributorSlots, projection.month, workspace.inputs.memberships);
        const recognition = projection.recognized.find(row => row.targetCardId === card.id && row.scopeKey === definition.key && row.scopeInstanceKey === binding.instanceKey);
        if (binding.reasons.length || !binding.instanceKey || !binding.contributors.includes(transaction.user_card_id ?? "") || !recognition) continue;
        if (!targets.some(target => target.kind === "performance" && target.key === definition.key && target.instanceKey === binding.instanceKey))
          targets.push({ kind: "performance", key: definition.key, instanceKey: binding.instanceKey, ruleVersionId: selected.id, automaticAmount: recognition.automaticAmount, unit: { kind: "won" } });
      }
    }
  }
  const refunds = workspace.inputs.adjustments.filter(row => row.transaction_id === transaction.id && !row.voided_at);
  const principal = getTransactionAmounts(transaction).actualAmount;
  const refunded = sumKnown(refunds.map(row => readIntegerAmount(row.amount)));
  return { targets, annotations: workspace.inputs.annotations.filter(row => row.transaction_id === transaction.id && !row.voided_at), refunds,
    ownerRevision: workspace.ownerRevision, transactionVersion: transaction.version,
    refundableAmount: principal === null || refunded === null ? null : Math.max(0, principal - refunded) };
}
export type TransactionEditorContext = ReturnType<typeof transactionEditorContext>;

export function cardInputOptions(workspace: CardWorkspace, summary: CardPerformanceSummary) {
  const previous = workspace.throughMonth > "0001-01" ? shiftMonth(workspace.throughMonth, -1) : null;
  const performance: { month: MonthKey; definition: PolicyScope; instanceKey: string; scope: ScopeSummary; existing: CardWorkspace["inputs"]["monthInputs"][number] | null }[] = [];
  const current = workspacePerformanceScopes(workspace, summary);
  let priorScopes: ReturnType<typeof workspacePerformanceScopes> = [];
  for (const month of [previous, workspace.throughMonth]) {
    if (!month || !workspace.replay.months.some(item => item.month === month)) continue;
    const snapshot = month === workspace.throughMonth ? workspace : buildCardWorkspace(workspace.inputs, workspace.ownerRevision, month, workspace.replay);
    const selectedSummary = snapshot.summaries.find(item => item.userCard.id === summary.userCard.id);
    if (!selectedSummary) continue;
    const scopes = workspacePerformanceScopes(snapshot, selectedSummary);
    if (month === previous) priorScopes = scopes;
    for (const { scope, metadata } of scopes) {
      if (!metadata) continue;
      const existing = workspace.inputs.monthInputs.filter(row => row.month.slice(0, 7) === month && row.scope_kind === "performance" && row.scope_key === scope.scopeKey && row.scope_instance_key === scope.scopeInstanceKey);
      if (existing.length > 1) continue;
      performance.push({ month, definition: metadata.definition, instanceKey: scope.scopeInstanceKey, scope, existing: existing[0] ?? null });
    }
  }
  if (previous) {
    // Only actual selected services (including their tiered quotas) can require a
    // pre-policy month. Match replay.previous's SELECTED-month binding, not a
    // synthetic execution of the current policy over all historical purchases.
    const required = new Set<string>();
    for (const service of workspaceBenefitServices(workspace, summary)) {
      const parsed = cardPolicySchema.safeParse(service.version?.policy_json);
      if (!service.version || !service.definition || !parsed.success) continue;
      const keys = new Set(service.definition.performance.kind === "previous_month" ? [service.definition.performance.scopeKey] : []);
      for (const quota of parsed.data.quotas) {
        if (service.definition.quotaKeys.includes(quota.key) && quota.limit.kind === "tiered") keys.add(quota.limit.scopeKey);
      }
      for (const definition of parsed.data.performanceScopes.filter(item => keys.has(item.key))) {
        const binding = resolveScopeBinding(workspace.ownerId, summary.userCard.id, service.version.id, "performance", definition.key, definition.contributorSlots, workspace.throughMonth, workspace.inputs.memberships);
        if (!binding.reasons.length) required.add(JSON.stringify([definition.key, binding.instanceKey]));
      }
    }
    for (const { scope, metadata } of current) {
      if (!metadata || !required.has(JSON.stringify([scope.scopeKey, scope.scopeInstanceKey]))) continue;
      // Even an unresolved historical match takes precedence: never conceal its
      // conflicting definitions by replacing them with selected-month metadata.
      if (priorScopes.some(item => item.scope.scopeKey === scope.scopeKey && item.scope.scopeInstanceKey === scope.scopeInstanceKey)) continue;
      const existing = workspace.inputs.monthInputs.filter(row => row.owner_id === workspace.ownerId && row.month.slice(0, 7) === previous && row.scope_kind === "performance" && row.scope_key === scope.scopeKey && row.scope_instance_key === scope.scopeInstanceKey);
      if (existing.length > 1) continue;
      const original = existing[0] ?? null;
      performance.push({ month: previous, definition: metadata.definition, instanceKey: scope.scopeInstanceKey, existing: original,
        scope: summarizePerformance(metadata.definition, scope.scopeInstanceKey, unknownAmount("incomplete_data"), original) });
    }
    performance.sort((a, b) => a.month.localeCompare(b.month));
  }
  const targets = current.flatMap(({ scope, metadata }) => {
    if (!metadata || current.some(other => other.scope.scopeKey === scope.scopeKey && (!other.metadata || JSON.stringify(other.metadata.definition.tiers) !== JSON.stringify(metadata.definition.tiers)))) return [];
    return metadata.definition.tiers.map(tier => ({ scopeKey: scope.scopeKey, tierKey: tier.key, minimumSpend: tier.minimumSpend }));
  }).filter((target, index, list) => list.findIndex(other => other.scopeKey === target.scopeKey && other.tierKey === target.tierKey) === index);
  // Daily pools consume one month source, not a source per day/card/service.
  // Keep their replay-owned caps and reasons separate: different days may have
  // different valid caps. Only monthly pools support an opening remaining input.
  const quotaSources = new Map<string, ReturnType<typeof workspaceQuotaGroups>>();
  for (const group of workspaceQuotaGroups(workspace)) {
    const key = JSON.stringify([workspace.throughMonth, group.quota.scopeKey, group.quota.scopeInstanceKey]);
    quotaSources.set(key, [...(quotaSources.get(key) ?? []), group]);
  }
  const quotas = [...quotaSources.values()].filter(groups => groups.some(group => group.cardIds.includes(summary.userCard.id))).map(groups => {
    const pools = groups.map(group => group.quota).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
    const quota = { ...pools[0], reasons: [...new Set(pools.flatMap(pool => pool.reasons))] };
    const cardIds = [...new Set(groups.flatMap(group => group.cardIds))];
    const cardNames = [...new Set(groups.flatMap(group => group.cardNames))];
    const services = [...new Set(groups.flatMap(group => group.services))];
    const originals = workspace.inputs.monthInputs.filter(row => row.owner_id === workspace.ownerId && row.month.slice(0, 7) === workspace.throughMonth && row.scope_kind === "quota" && row.scope_key === quota.scopeKey && row.scope_instance_key === quota.scopeInstanceKey);
    return { quota, pools, cardIds, cardNames, services, shared: cardIds.length > 1 || services.length > 1,
      supportsRemaining: pools.every(pool => pool.period === "monthly"), month: workspace.throughMonth, instanceKey: quota.scopeInstanceKey,
      existing: originals.length === 1 ? originals[0] : null, originals,
      editable: originals.length <= 1 && !quota.reasons.some(reason => ["quota_definition_conflict", "scope_binding_unknown"].includes(reason)) };
  });
  return { targets, performance, quotas };
}
