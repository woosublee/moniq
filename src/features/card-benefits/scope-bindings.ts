import type { MonthKey } from "./periods";
import { normalizedQuotaConsumption } from "./policy-schema";
import type { CardRuleVersionRecord, CardScopeMembershipRecord, ScopeKind } from "./types";
import type { PolicyQuota, ReplayReason } from "./engine-types";

export function selectRuleVersion(cardId: string, day: string, versions: readonly CardRuleVersionRecord[]): CardRuleVersionRecord | null {
  const candidates = versions.filter((row) => row.card_id === cardId && row.publication_status === "published" && row.verification_status === "verified" && row.effective_from !== null && row.effective_from <= day && (!row.effective_until || day < row.effective_until))
    .sort((a, b) => b.version_order - a.version_order || a.id.localeCompare(b.id));
  if (candidates.length > 1 && candidates[0].version_order === candidates[1].version_order) return null;
  return candidates[0] ?? null;
}

export type ScopeBinding = { instanceKey: string; contributors: string[]; reasons: ReplayReason[] };
export function resolveScopeBinding(ownerId: string, targetCardId: string, versionId: string, kind: ScopeKind, key: string, slots: readonly string[], month: MonthKey, memberships: readonly CardScopeMembershipRecord[]): ScopeBinding {
  const rows = memberships.filter((row) => row.owner_id === ownerId && row.target_user_card_id === targetCardId && row.rule_version_id === versionId && row.scope_kind === kind && row.scope_key === key && row.valid_from_month.slice(0, 7) <= month && (!row.valid_until_month || month < row.valid_until_month.slice(0, 7)));
  const instances = new Set(rows.map((row) => row.scope_instance_key));
  const invalid = instances.size > 1 || rows.some((row) => row.contributor_slot === "self" || !slots.includes(row.contributor_slot)) || new Set(rows.map((row) => row.contributor_slot)).size !== rows.length;
  return {
    instanceKey: [...instances].sort()[0] ?? `card:${targetCardId}:${kind}:${key}`,
    contributors: [...new Set([targetCardId, ...rows.filter((row) => slots.includes(row.contributor_slot)).map((row) => row.contributor_user_card_id)])].sort(),
    reasons: invalid ? ["scope_binding_unknown"] : [],
  };
}

/** Stable instance + quota key is the pool identity. Version id is deliberately absent.
 * Reusing that identity is legal only with equal period, consumption/unit and cap meaning.
 * Resolved tier caps and binding continuity must ALSO agree in replay/DB commands.
 */
export function compatibleQuotaDefinitions(left: PolicyQuota, right: PolicyQuota): boolean {
  const canonical = (quota: PolicyQuota) => ({
    period: quota.period ?? "monthly",
    consumption: normalizedQuotaConsumption(quota),
    sharing: quota.sharing.kind,
    limit: quota.limit.kind === "fixed" ? quota.limit : { ...quota.limit, amounts: [...quota.limit.amounts].sort((a, b) => a.tierKey.localeCompare(b.tierKey)) },
  });
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
