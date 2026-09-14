import { parseMonth, type MonthKey } from "@/features/card-benefits/periods";
import { paginateLedgerRows, sortLedgerRows } from "@/features/ledger/projection";
import { ledgerQueryHref, parseLedgerQuery } from "@/features/ledger/workspace-view";
import { cardPolicySchema, type CardPolicy } from "@/features/card-benefits/policy-schema";
import { resolveScopeBinding, selectRuleVersion } from "@/features/card-benefits/scope-bindings";
import type { CardPerformanceSummary, CardRuleVersionRecord } from "@/features/card-benefits/types";
import type { PolicyBenefit, ReplayBenefit } from "@/features/card-benefits/engine-types";
import { readIntegerAmount } from "@/features/card-benefits/money";
import { getTransactionAmounts, seoulMonth, sumKnown, type CardWorkspace } from "@/lib/card-workspace/view-model";
import type { TransactionRecord } from "@/features/transactions/types";

export const workspaceTabs = { performance: "실적 관리", benefits: "혜택 관리", transactions: "사용내역" } as const;
export type CardsQuery = { month: MonthKey; tab: keyof typeof workspaceTabs; query: string; card: string; page: number };
export type CardsSearchParams = Record<string, string | string[] | undefined>;
export function parseCardsQuery(params: CardsSearchParams, fallbackMonth: MonthKey): CardsQuery {
  const single = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const tab = single("tab") === "activity" ? "transactions" : single("tab");
  const page = single("page");
  return { month: parseMonth(single("month")) ?? fallbackMonth,
    tab: Object.hasOwn(workspaceTabs, tab) ? tab as CardsQuery["tab"] : "performance",
    query: single("query").trim().slice(0, 120), card: single("card").slice(0, 100),
    page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1 };
}
export function cardsHref(state: CardsQuery, patch: Partial<CardsQuery> = {}) {
  const next = { ...state, page: 1, ...patch };
  const params = new URLSearchParams({ month: next.month, tab: next.tab });
  if (next.query) params.set("query", next.query);
  if (next.card) params.set("card", next.card);
  if (next.page > 1) params.set("page", String(next.page));
  return `/cards?${params}`;
}
export function cardDetailHref(id: string, state: CardsQuery) {
  return `/cards/${encodeURIComponent(id)}?${cardsHref(state, { page: state.page }).split("?")[1]}`;
}
export function ledgerHref(month: MonthKey, input = false, card = "") {
  return `${ledgerQueryHref(parseLedgerQuery({ month, card }, month))}${input ? "#quick-entry" : ""}`;
}
export function performanceGeometry(tiers: readonly { key: string; minimumSpend: number }[], amount: number | null) {
  if (amount === null || !Number.isSafeInteger(amount) || amount < 0 || !tiers.length || tiers.some((tier, i) => !Number.isSafeInteger(tier.minimumSpend) || tier.minimumSpend < 0 || i > 0 && tier.minimumSpend <= tiers[i - 1].minimumSpend)) return null;
  let fill = 100;
  const nextIndex = tiers.findIndex(tier => amount < tier.minimumSpend);
  if (nextIndex >= 0) {
    const previous = nextIndex === 0 ? 0 : tiers[nextIndex - 1].minimumSpend;
    fill = (nextIndex + (amount - previous) / (tiers[nextIndex].minimumSpend - previous)) * 100 / tiers.length;
  }
  return { fill, marks: tiers.map((tier, index) => ({ ...tier, position: (index + 1) * 100 / tiers.length, reached: amount >= tier.minimumSpend })) };
}
/** Only the exact replay-selected executable version supplies geometry, never a public candidate. */
export function workspaceCardPolicy(workspace: CardWorkspace, summary: CardPerformanceSummary): CardPolicy | null {
  return selectedPolicy(workspace, summary.userCard.card_id, summary.workspace?.ruleVersionId);
}
function selectedPolicy(workspace: CardWorkspace, cardId: string, versionId: string | null | undefined): CardPolicy | null {
  const version = workspace.inputs.ruleVersions.find(row => row.id === versionId && row.card_id === cardId);
  if (!version || version.publication_status !== "published" || version.verification_status !== "verified" || !version.effective_from) return null;
  const parsed = cardPolicySchema.safeParse(version.policy_json);
  return parsed.success ? parsed.data : null;
}
/** Resolve presentation metadata only; amounts and achievement remain replay-owned.
 * Replay registers target scopes at month-end and on every transaction day, including
 * other-card transactions. A source transaction's version cannot identify its targets.
 */
export function workspacePerformanceScopes(workspace: CardWorkspace, summary: CardPerformanceSummary) {
  const versionIds = new Set<string>();
  if (summary.workspace?.ruleVersionId) versionIds.add(summary.workspace.ruleVersionId);
  const days = new Set(workspace.transactions.filter(row => !row.input_excluded && row.workspace?.projection.month === workspace.throughMonth && row.workspace.projection.day).map(row => row.workspace!.projection.day!));
  for (const day of days) {
    const version = selectRuleVersion(summary.userCard.card_id, day, workspace.inputs.ruleVersions);
    if (version) versionIds.add(version.id);
  }
  const candidates = [...versionIds].flatMap(versionId => {
    const policy = selectedPolicy(workspace, summary.userCard.card_id, versionId);
    return (policy?.performanceScopes ?? []).map(definition => ({ definition,
      binding: resolveScopeBinding(workspace.ownerId, summary.userCard.id, versionId, "performance", definition.key, definition.contributorSlots, workspace.throughMonth, workspace.inputs.memberships) }));
  });
  return (summary.workspace?.performance ?? []).map(scope => {
    const matches = candidates.filter(({ definition, binding }) => definition.key === scope.scopeKey && binding.instanceKey === scope.scopeInstanceKey);
    const signatures = new Set(matches.map(({ definition, binding }) => JSON.stringify([definition, binding.contributors])));
    // ScopeSummary has no version id. Never choose a month-end definition when the
    // same instance has conflicting versions, or invent metadata for an absent match.
    const resolved = matches.length > 0 && signatures.size === 1 && matches.every(({ binding }) => !binding.reasons.length);
    const contributors = resolved ? workspace.inputs.cards.filter(card => card.owner_id === workspace.ownerId && matches[0].binding.contributors.includes(card.id)) : [];
    const metadata = resolved && contributors.length === matches[0].binding.contributors.length ? { definition: matches[0].definition, contributors } : null;
    return { scope, metadata };
  });
}
type WorkspaceBenefitService = {
  key: string;
  versionId: string | null;
  version: CardRuleVersionRecord | null;
  definition: PolicyBenefit | null;
  applied: ReplayBenefit[];
  incomplete: boolean;
};
/** Service identity includes the transaction's selected version, unlike quota pools. */
export function workspaceBenefitServices(workspace: CardWorkspace, summary: CardPerformanceSummary) {
  const services = new Map<string, WorkspaceBenefitService>();
  const add = (versionId: string | null, key: string) => {
    const identity = JSON.stringify([versionId, key]);
    let service = services.get(identity);
    if (!service) {
      const definition = selectedPolicy(workspace, summary.userCard.card_id, versionId)?.benefits.find(benefit => benefit.key === key) ?? null;
      const version = definition ? workspace.inputs.ruleVersions.find(row => row.id === versionId && row.card_id === summary.userCard.card_id) ?? null : null;
      service = { key, versionId, version, definition, applied: [], incomplete: !definition };
      services.set(identity, service);
    }
    return service;
  };
  for (const row of workspace.transactions) {
    const projection = row.workspace?.projection;
    if (row.input_excluded || row.user_card_id !== summary.userCard.id || projection?.month !== workspace.throughMonth) continue;
    for (const benefit of projection.benefits) {
      const service = add(projection.ruleVersionId, benefit.key);
      service.applied.push(benefit);
      // Transaction completeness also includes siblings. Replay carries this service's
      // dependency uncertainty; an unassigned benefit correction may still affect it.
      const unallocated = projection.unallocatedAnnotations.some(note => note.target_kind !== "performance" && (note.target_key === null || note.target_key === benefit.key));
      service.incomplete ||= benefit.status === "unknown" || benefit.appliedAmount === null || benefit.unit === null || unallocated;
    }
  }
  // Keep month-end services with no activity, without using them to relabel history.
  for (const definition of workspaceCardPolicy(workspace, summary)?.benefits ?? [])
    add(summary.workspace?.ruleVersionId ?? null, definition.key);
  return [...services.values()].sort((a, b) => (a.version?.version_order ?? Infinity) - (b.version?.version_order ?? Infinity) || (a.versionId ?? "").localeCompare(b.versionId ?? "") || a.key.localeCompare(b.key));
}
export function workspaceQuotaGroups(workspace: CardWorkspace) {
  const quotas = workspace.replay.months.find(month => month.month === workspace.throughMonth)?.quotas ?? [];
  const selections = new Map(workspace.summaries.map(summary => [JSON.stringify([summary.userCard.id, summary.workspace?.ruleVersionId]), { card: summary.userCard, versionId: summary.workspace?.ruleVersionId }]));
  // A pool may belong to a version used earlier in this month, not the month-end policy.
  for (const row of workspace.transactions) {
    const projection = row.workspace?.projection;
    const card = workspace.inputs.cards.find(card => card.id === row.user_card_id);
    if (!row.input_excluded && card && projection?.month === workspace.throughMonth && projection.ruleVersionId)
      selections.set(JSON.stringify([card.id, projection.ruleVersionId]), { card, versionId: projection.ruleVersionId });
  }
  return quotas.map(quota => {
    const cardNames = new Set<string>();
    const cardIds = new Set<string>();
    const services = new Set<string>();
    for (const { card, versionId } of selections.values()) {
      const policy = selectedPolicy(workspace, card.card_id, versionId);
      const definition = policy?.quotas.find(item => item.key === quota.scopeKey);
      if (!definition || !versionId) continue;
      const binding = resolveScopeBinding(workspace.ownerId, card.id, versionId, "quota", definition.key, definition.sharing.kind === "shared" ? definition.sharing.contributorSlots : ["self"], workspace.throughMonth, workspace.inputs.memberships);
      if (binding.instanceKey !== quota.scopeInstanceKey) continue;
      cardIds.add(card.id);
      cardNames.add(card.alias || card.card.name);
      policy!.benefits.filter(benefit => benefit.quotaKeys.includes(definition.key)).forEach(benefit => services.add(benefit.key));
    }
    return { quota, cardNames: [...cardNames], cardIds: [...cardIds], services: [...services], shared: cardIds.size > 1 || services.size > 1 };
  });
}
export type ActivityRow = { id: string; kind: "purchase" | "refund"; occurredAt: string; stableSequence?: number | string; amount: number | null; transaction: TransactionRecord };
export function selectWorkspaceActivity(workspace: CardWorkspace, state: CardsQuery) {
  const matches = (transaction: TransactionRecord) => !transaction.input_excluded && (!state.card || transaction.user_card_id === state.card) && (!state.query || `${transaction.merchant_name} ${transaction.user_cards?.card.name ?? ""} ${transaction.user_cards?.alias ?? ""}`.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
  const purchases = workspace.transactions.filter(row => row.workspace?.projection.month === state.month && matches(row));
  const sources = new Map(workspace.transactions.map(row => [row.id, row]));
  const rows: ActivityRow[] = purchases.map(transaction => ({ id: transaction.id, kind: "purchase", occurredAt: transaction.occurred_at, stableSequence: transaction.stable_sequence, amount: getTransactionAmounts(transaction).actualAmount, transaction }));
  const refunds: ActivityRow[] = workspace.inputs.adjustments.flatMap(refund => {
    const transaction = sources.get(refund.transaction_id);
    return !refund.voided_at && seoulMonth(refund.occurred_at) === state.month && transaction && matches(transaction)
      ? [{ id: refund.id, kind: "refund" as const, occurredAt: refund.occurred_at, stableSequence: refund.stable_sequence, amount: readIntegerAmount(refund.amount), transaction }] : [];
  });
  rows.push(...refunds);
  const page = paginateLedgerRows(sortLedgerRows(rows), state.page);
  const actualAmount = sumKnown(purchases.map(row => getTransactionAmounts(row).actualAmount));
  const refundAmount = sumKnown(refunds.map(row => row.amount));
  return { ...page, actualAmount, refundAmount,
    cashFlowAmount: sumKnown([actualAmount, refundAmount === null ? null : -refundAmount]) };
}
