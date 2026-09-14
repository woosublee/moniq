import { matchMerchantConfidence } from "@/features/merchants/match-confidence";
import type { LedgerTransactionRecord } from "@/features/transactions/types";
import type { CardInstanceRecord } from "@/features/cards/types";
import type { CardMonthInputRecord, CardRuleVersionRecord, ScopeKind } from "./types";
import { cardPolicySchema, normalizedQuotaConsumption, type CardPolicy } from "./policy-schema";
import type { PolicyBenefit, PolicyQuota, PolicyScope, ReplayAmount, ReplayInputs, ReplayQuotaSummary, ReplayReason, ReplayResult, ReplayTransaction, ScopeSummary } from "./engine-types";
import { parseMonth, parseSeoulInstant as instant, readStableSequence as sequence, shiftMonth, type MonthKey } from "./periods";
import { readIntegerAmount } from "./money";
import { calculatePolicyBenefit, type PolicyBenefitCandidate } from "./calculation";
import { applyBenefitAnnotations, applyPerformanceAnnotations } from "@/features/transactions/calculation";
import { calculateScopeRecognition, finalPaidAmount } from "./performance";
import { matchPolicyConditions, type PolicyMatch, type PolicyMatchInput } from "./rule-matching";
import { compatibleQuotaDefinitions, resolveScopeBinding, selectRuleVersion, type ScopeBinding } from "./scope-bindings";
import { knownAmount, reasons, sumAmounts, summarizeBenefits, summarizePerformance, unitKey, unknownAmount } from "./summaries";

type SelectedPolicy = { version: CardRuleVersionRecord; policy: CardPolicy };
type Prepared = { source: LedgerTransactionRecord; result: ReplayTransaction; selected: SelectedPolicy | null; time: bigint | null; sequence: bigint | null };
type ScopeNode = { card: CardInstanceRecord; scope: PolicyScope; binding: ScopeBinding; selected: SelectedPolicy; ledger: ReplayAmount };
type Pool = ReplayQuotaSummary & { definition: PolicyQuota; participantSignature: string };

function monthEnd(month: MonthKey): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}
function dataFor(inputs: ReplayInputs, month: MonthKey, kind: ScopeKind, key: string, instance: string): CardMonthInputRecord | null {
  const rows = inputs.monthInputs.filter((row) => row.owner_id === inputs.ownerId && row.month.slice(0, 7) === month && row.scope_kind === kind && row.scope_key === key && row.scope_instance_key === instance);
  return rows.length === 1 ? rows[0] : null;
}
function bindingFor(inputs: ReplayInputs, cardId: string, selected: SelectedPolicy, kind: ScopeKind, key: string, slots: string[], month: MonthKey): ScopeBinding {
  return resolveScopeBinding(inputs.ownerId, cardId, selected.version.id, kind, key, slots, month, inputs.memberships);
}
const nodeKey = (target: string, key: string, instance: string) => JSON.stringify([target, key, instance]);

export function replayLedger(inputs: ReplayInputs, throughMonth: MonthKey): ReplayResult {
  if (!parseMonth(inputs.startMonth) || !parseMonth(throughMonth) || inputs.startMonth > throughMonth) throw new RangeError("Invalid replay month range");
  const output: ReplayResult = { transactions: [], months: [], issues: [] };
  const cards = inputs.cards.filter((card) => card.owner_id === inputs.ownerId).slice().sort((a, b) => a.id.localeCompare(b.id));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const parsed = new Map<string, CardPolicy | null>();
  const select = (card: CardInstanceRecord | undefined, day: string): SelectedPolicy | null => {
    if (!card) return null;
    const version = selectRuleVersion(card.card_id, day, inputs.ruleVersions);
    if (!version) return null;
    if (!parsed.has(version.id)) {
      const policy = cardPolicySchema.safeParse(version.policy_json);
      parsed.set(version.id, policy.success ? policy.data : null);
    }
    const policy = parsed.get(version.id);
    return policy ? { version, policy } : null;
  };
  const annotationsFor = (transactionId: string) => inputs.annotations.filter((note) => note.owner_id === inputs.ownerId && note.transaction_id === transactionId && !note.voided_at);
  const allPrepared: Prepared[] = inputs.transactions.filter((source) => source.owner_id === inputs.ownerId).map((source) => {
    const at = instant(source.occurred_at);
    const selected = at ? select(cardById.get(source.user_card_id ?? ""), at.day) : null;
    const principal = readIntegerAmount(source.actual_amount);
    let net: ReplayAmount = principal === null ? unknownAmount("precision_unknown") : knownAmount(principal);
    const refunds = inputs.adjustments.filter((row) => row.owner_id === inputs.ownerId && row.transaction_id === source.id && !row.voided_at);
    if (refunds.length) {
      const refunded = sumAmounts(refunds.map((row) => {
        const amount = readIntegerAmount(row.amount);
        return amount === null ? unknownAmount("precision_unknown") : knownAmount(amount);
      }));
      const kind = selected?.policy.cancellation.kind;
      if (kind !== "verified_original_month_net_replay") net = unknownAmount(kind === "verified_unsupported" ? "unsupported_condition" : "refund_policy_unknown");
      else if (net.amount === null || refunded.amount === null) net = { amount: null, reasons: reasons(net.reasons, refunded.reasons) };
      else net = refunded.amount > net.amount ? unknownAmount("unsupported_condition") : knownAmount(net.amount - refunded.amount);
    }
    // Exclusion preserves source/notes/refunds for restoration, but contributes nothing.
    if (source.input_excluded) net = knownAmount(0);
    const policyNotApplicable = source.payment_method === "cash" && source.user_card_id === null;
    const why = source.input_excluded ? [] : reasons(net.reasons, !selected && !policyNotApplicable ? ["policy_unverified"] : [], !at ? ["ordering_unknown"] : []);
    return { source, selected, time: at?.time ?? null, sequence: sequence(source.stable_sequence), result: {
      id: source.id, userCardId: source.user_card_id, month: at?.month ?? null, day: at?.day ?? null,
      ruleVersionId: selected?.version.id ?? null, merchant: matchMerchantConfidence(source.merchant_name, inputs.merchantRules),
      netAmount: net.amount, unresolvedAnnotations: annotationsFor(source.id).filter((note) => note.review_status === "needs_review" || note.target_key === null), unallocatedAnnotations: [], benefits: [], recognized: [], reasons: why,
    } };
  }).sort((a, b) => (a.time === b.time ? 0 : a.time === null ? 1 : b.time === null ? -1 : a.time < b.time ? -1 : 1) || (a.sequence !== null && b.sequence !== null ? a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0 : 0) || a.source.id.localeCompare(b.source.id));
  // All calculation paths, including previews, ordering uncertainty and refund cash
  // flow, consume only active sources. Excluded projections remain available for audit.
  const prepared = allPrepared.filter((row) => !row.source.input_excluded);
  // Resolve allocation from the current source card/date and direct memberships, not
  // audit basis_* snapshots. Do this before replay so month-end previews see later notes.
  const contributingScopeInstances = new Map<Prepared, Set<string>>();
  for (const row of prepared) {
    const { day, month } = row.result;
    const targets = !day || !month ? [] : cards.flatMap((card) => {
      const selected = select(card, day);
      return selected ? selected.policy.performanceScopes.map((scope) => ({ scope,
        binding: bindingFor(inputs, card.id, selected, "performance", scope.key, scope.contributorSlots, month) })) : [];
    });
    const contributingTargets = targets.filter(({ binding }) => !binding.reasons.length && binding.contributors.includes(row.source.user_card_id ?? ""));
    contributingScopeInstances.set(row, new Set(contributingTargets.map(({ binding }) => binding.instanceKey)));
    row.result.unallocatedAnnotations = annotationsFor(row.source.id).filter((note) => {
      if (note.target_kind !== "performance") return !row.selected?.policy.benefits.some((benefit) => benefit.key === note.target_key);
      return !contributingTargets.some(({ scope, binding }) => scope.key === note.target_key && binding.instanceKey === note.scope_instance_key);
    });
    if (row.result.unallocatedAnnotations.length) row.result.reasons = reasons(row.result.reasons, ["annotation_allocation_unknown"]);
  }
  const recognitionFor = (row: Prepared, scope: PolicyScope, binding: ScopeBinding, benefits = row.result.benefits) => {
    const matchInput: PolicyMatchInput = { merchant: row.result.merchant, category: row.source.ledger_category || row.result.merchant.category, channel: row.source.payment_channel, installmentMonths: row.source.installment_months, amount: row.result.netAmount };
    const principal: ReplayAmount = { amount: row.result.netAmount, reasons: row.result.netAmount === null ? row.result.reasons : [] };
    let automatic = calculateScopeRecognition(scope, matchInput, row.source.input_excluded, principal, benefits, row.selected !== null);
    const allocationUnknown = row.result.unallocatedAnnotations.some((note) => {
      if (note.target_kind !== "performance") return scope.basis === "net_paid" || (scope.benefitExclusions?.length ?? 0) > 0;
      // A removed key can retain an identifiable instance. Isolate that uncertainty,
      // but do not dismiss notes whose old target no longer receives this source card.
      const identified = note.scope_instance_key !== null && contributingScopeInstances.get(row)?.has(note.scope_instance_key);
      return !identified || note.scope_instance_key === binding.instanceKey;
    });
    if (allocationUnknown) automatic = unknownAmount(...automatic.reasons, "annotation_allocation_unknown");
    return { automatic, applied: applyPerformanceAnnotations(automatic, scope.key, binding.instanceKey, annotationsFor(row.source.id)) };
  };
  const undated = prepared.filter((row) => row.result.month === null);
  const ambiguousOrder = (rows: readonly Prepared[]): boolean => rows.some((row) => {
    const simultaneous = rows.filter((other) => other.time === row.time);
    return simultaneous.length > 1 && (simultaneous.some((other) => other.sequence === null) || new Set(simultaneous.map((other) => String(other.sequence))).size !== simultaneous.length);
  });
  const completedScopes = new Map<string, ScopeSummary>();
  const previous = (cardId: string, selected: SelectedPolicy, scope: PolicyScope, month: MonthKey): ScopeSummary => {
    const prior = shiftMonth(month, -1);
    // The current version points at a stable scope instance. Reuse MONEY, never its old tier label.
    const binding = bindingFor(inputs, cardId, selected, "performance", scope.key, scope.contributorSlots, month);
    const completed = completedScopes.get(JSON.stringify([prior, cardId, scope.key, binding.instanceKey]));
    const ledger = completed ? { amount: completed.ledgerAmount, reasons: completed.ledgerAmount === null ? completed.reasons : [] } : unknownAmount("incomplete_data");
    return summarizePerformance(scope, binding.instanceKey, binding.reasons.length ? unknownAmount(...binding.reasons) : ledger, dataFor(inputs, prior, "performance", scope.key, binding.instanceKey));
  };

  const quotaCap = (cardId: string, selected: SelectedPolicy, quota: PolicyQuota, month: MonthKey): number | null => {
    const limit = quota.limit;
    if (limit.kind === "fixed") return limit.amount;
    const scope = selected.policy.performanceScopes.find((entry) => entry.key === limit.scopeKey)!;
    const summary = previous(cardId, selected, scope, month);
    return summary.amount === null ? null : summary.tierKey ? limit.amounts.find((entry) => entry.tierKey === summary.tierKey)!.amount : 0;
  };

  for (let month = inputs.startMonth; ; month = shiftMonth(month, 1)) {
    const monthRows = prepared.filter((row) => row.result.month === month);
    const scopes = new Map<string, ScopeNode>();
    const pools = new Map<string, Pool>();
    const poolHistory = new Map<string, { binding: ScopeBinding; definition: PolicyQuota; version: string }>();
    const registerScopes = (card: CardInstanceRecord, selected: SelectedPolicy) => {
      for (const scope of selected.policy.performanceScopes) {
        const binding = bindingFor(inputs, card.id, selected, "performance", scope.key, scope.contributorSlots, month);
        const key = nodeKey(card.id, scope.key, binding.instanceKey);
        if (!scopes.has(key)) {
          const incomplete = undated.some((row) => binding.contributors.includes(row.source.user_card_id ?? "")) || monthRows.some((row) => binding.contributors.includes(row.source.user_card_id ?? "") && !select(card, row.result.day!));
          const why = reasons(binding.reasons, incomplete ? ["incomplete_data"] : []);
          scopes.set(key, { card, selected, scope, binding, ledger: why.length ? unknownAmount(...why) : knownAmount(0) });
        }
      }
    };
    for (const card of cards) {
      const selected = select(card, monthEnd(month));
      if (selected) registerScopes(card, selected);
    }
    const getPool = (card: CardInstanceRecord, selected: SelectedPolicy, quota: PolicyQuota, day: string): Pool => {
      const binding = bindingFor(inputs, card.id, selected, "quota", quota.key, quota.sharing.kind === "shared" ? quota.sharing.contributorSlots : ["self"], month);
      const period = quota.period ?? "monthly";
      const periodKey = period === "daily" ? day : month;
      const poolKey = JSON.stringify([binding.instanceKey, quota.key, periodKey]);
      const existing = pools.get(poolKey);
      const participantSignature = JSON.stringify(binding.contributors);
      const historyKey = JSON.stringify([card.id, quota.key, periodKey]);
      const prior = poolHistory.get(historyKey);
      const incompatible = Boolean(prior && (prior.binding.instanceKey !== binding.instanceKey || JSON.stringify(prior.binding.contributors) !== JSON.stringify(binding.contributors) || !compatibleQuotaDefinitions(prior.definition, quota)));
      poolHistory.set(historyKey, { binding, definition: quota, version: selected.version.id });
      const cap = quotaCap(card.id, selected, quota, month);
      if (existing) {
        if (incompatible || existing.participantSignature !== participantSignature || existing.cap !== cap || !compatibleQuotaDefinitions(existing.definition, quota)) {
          existing.remaining = null; existing.consumed = null;
          existing.reasons = reasons(existing.reasons, ["quota_definition_conflict"]);
        }
        return existing;
      }
      // Verify every covered period segment, including versions with no purchase rows.
      const continuityReasons: ReplayReason[] = [];
      const firstDay = period === "daily" ? Number(day.slice(8)) : 1;
      const lastDay = period === "daily" ? firstDay : Number(monthEnd(month).slice(8));
      for (let number = firstDay; number <= lastDay; number++) {
        const date = `${month}-${String(number).padStart(2, "0")}`;
        if (card.issued_on && date < card.issued_on) continue;
        const earlier = select(card, date);
        const priorQuota = earlier?.policy.quotas.find((entry) => entry.key === quota.key);
        if (!earlier || !priorQuota) { continuityReasons.push("incomplete_data"); continue; }
        const priorBinding = bindingFor(inputs, card.id, earlier, "quota", quota.key, priorQuota.sharing.kind === "shared" ? priorQuota.sharing.contributorSlots : ["self"], month);
        if (priorBinding.instanceKey !== binding.instanceKey || JSON.stringify(priorBinding.contributors) !== JSON.stringify(binding.contributors) || !compatibleQuotaDefinitions(priorQuota, quota) || quotaCap(card.id, earlier, priorQuota, month) !== cap) continuityReasons.push("quota_definition_conflict");
        continuityReasons.push(...priorBinding.reasons);
        if (quota.sharing.kind === "shared") for (const contributor of binding.contributors.filter((id) => id !== card.id)) {
          const partner = select(cardById.get(contributor), date);
          const partnerQuota = partner?.policy.quotas.find((entry) => entry.key === quota.key);
          if (!partner || !partnerQuota) { continuityReasons.push("scope_binding_unknown"); continue; }
          const partnerBinding = bindingFor(inputs, contributor, partner, "quota", quota.key, partnerQuota.sharing.kind === "shared" ? partnerQuota.sharing.contributorSlots : ["self"], month);
          if (partnerBinding.instanceKey !== binding.instanceKey || JSON.stringify(partnerBinding.contributors) !== JSON.stringify(binding.contributors) || !compatibleQuotaDefinitions(partnerQuota, quota) || quotaCap(contributor, partner, partnerQuota, month) !== cap) continuityReasons.push("quota_definition_conflict");
          continuityReasons.push(...partnerBinding.reasons);
        }
        // A disconnected group may claim this same actual pool. Validate every claimant
        // before the first award; never union their separately directed contributor sets.
        for (const claimant of cards) {
          if (claimant.issued_on && date < claimant.issued_on) continue;
          const claimantPolicy = select(claimant, date);
          const claimantQuota = claimantPolicy?.policy.quotas.find((entry) => entry.key === quota.key);
          if (!claimantPolicy || !claimantQuota) continue;
          const claimantPeriodKey = claimantQuota.period === "daily" ? date : month;
          if (claimantPeriodKey !== periodKey) continue;
          const claimantBinding = bindingFor(inputs, claimant.id, claimantPolicy, "quota", quota.key, claimantQuota.sharing.kind === "shared" ? claimantQuota.sharing.contributorSlots : ["self"], month);
          if (claimantBinding.instanceKey !== binding.instanceKey) continue;
          continuityReasons.push(...claimantBinding.reasons);
          if (JSON.stringify(claimantBinding.contributors) !== participantSignature || !compatibleQuotaDefinitions(claimantQuota, quota) || quotaCap(claimant.id, claimantPolicy, claimantQuota, month) !== cap) continuityReasons.push("quota_definition_conflict");
        }
      }
      const data = dataFor(inputs, month, "quota", quota.key, binding.instanceKey);
      const opening = data?.scope_kind === "quota" && data.data_status === "complete" ? cap : data?.scope_kind === "quota" && data.data_status === "remaining" && period === "monthly" ? readIntegerAmount(data.amount) : null;
      const contributors = monthRows.filter((row) => binding.contributors.includes(row.source.user_card_id ?? "") && (period !== "daily" || row.result.day === day));
      const incomplete = contributors.some((row) => !row.selected) || undated.some((row) => binding.contributors.includes(row.source.user_card_id ?? ""));
      const why = reasons(binding.reasons, continuityReasons, opening === null ? ["quota_unknown"] : [], incompatible || opening !== null && cap !== null && opening > cap ? ["quota_definition_conflict"] : [], incomplete ? ["incomplete_data"] : [], ambiguousOrder(contributors) ? ["ordering_unknown"] : []);
      const consumption = normalizedQuotaConsumption(quota);
      const pool: Pool = { poolKey, scopeInstanceKey: binding.instanceKey, scopeKey: quota.key, period, periodKey,
        consumption: consumption.kind, unit: consumption.kind === "benefit_amount" ? consumption.unit : null,
        cap, consumed: why.length ? null : 0, remaining: why.length ? null : opening, reasons: why, definition: quota, participantSignature };
      pools.set(poolKey, pool);
      return pool;
    };
    for (const row of monthRows) {
      const selected = row.selected;
      const ownCard = cardById.get(row.source.user_card_id ?? "");
      const principal: ReplayAmount = { amount: row.result.netAmount, reasons: row.result.netAmount === null ? row.result.reasons : [] };
      const matchInput: PolicyMatchInput = { merchant: row.result.merchant, category: row.source.ledger_category || row.result.merchant.category, channel: row.source.payment_channel, installmentMonths: row.source.installment_months, amount: row.result.netAmount };
      const annotations = annotationsFor(row.source.id);
      if (selected && ownCard) {
        registerScopes(ownCard, selected);
        const allocations = new Map<string, number | null>();
        const eligibilityFor = (benefit: PolicyBenefit): PolicyMatch => {
          if (benefit.performance.kind === "none") return { matches: true, reasons: [] };
          if (benefit.performance.kind === "current_month") {
            const basis = benefit.performance;
            const scope = selected.policy.performanceScopes.find((scope) => scope.key === basis.scopeKey)!;
            const binding = bindingFor(inputs, ownCard.id, selected, "performance", scope.key, scope.contributorSlots, month);
            const node = scopes.get(nodeKey(ownCard.id, scope.key, binding.instanceKey))!;
            const data = dataFor(inputs, month, "performance", scope.key, binding.instanceKey);
            const relevant = monthRows.filter((item) => binding.contributors.includes(item.source.user_card_id ?? ""));
            if (basis.timing !== "month_end" && ambiguousOrder(relevant)) return { matches: null, reasons: ["ordering_unknown"] };
            if (basis.timing !== "before_transaction") {
              const decisionRows = basis.timing === "month_end" ? relevant : relevant.filter((item) => monthRows.indexOf(item) <= monthRows.indexOf(row));
              const dependencies = decisionRows.flatMap((item) => (item.selected?.policy.benefits ?? [])
                .filter((candidate) => scope.benefitExclusions?.includes(candidate.key) || scope.basis === "net_paid" && (candidate.benefitKind === "discount" || candidate.benefitKind === "statement_credit"))
                .map((candidate) => ({ cardId: item.source.user_card_id, benefit: candidate })));
              // Same scope key on another card is not this scope. Cross-card dependency
              // execution is unsupported, not automatically a cycle or a transitive union.
              if (dependencies.length) {
                const directCycle = dependencies.some(({ cardId, benefit }) => cardId === ownCard.id && benefit.performance.kind === "current_month" && benefit.performance.scopeKey === scope.key && benefit.performance.timing !== "before_transaction");
                return { matches: null, reasons: ["unsupported_condition", directCycle ? "cyclic_performance_dependency" : "unsupported_performance_dependency"] };
              }
            }
            if (data?.scope_kind !== "performance" || data.data_status !== "complete") {
              if (basis.timing === "month_end" && data?.scope_kind === "performance" && data.data_status === "manual_total") {
                const amount = readIntegerAmount(data.amount);
                return amount === null ? { matches: null, reasons: ["precision_unknown"] } : { matches: amount >= scope.tiers[0].minimumSpend, reasons: [] };
              }
              return { matches: null, reasons: ["missing_performance"] };
            }
            let total = node.ledger;
            if (basis.timing === "including_transaction") total = sumAmounts([total, recognitionFor(row, scope, binding, []).applied]);
            if (basis.timing === "month_end") total = sumAmounts(relevant.map((item) => recognitionFor(item, scope, binding, []).applied));
            if (node.ledger.amount === null) total = node.ledger;
            return total.amount === null ? { matches: null, reasons: reasons(total.reasons, ["missing_performance"]) } : { matches: total.amount >= scope.tiers[0].minimumSpend, reasons: [] };
          }
          const basis = benefit.performance;
          const scope = selected.policy.performanceScopes.find((scope) => scope.key === basis.scopeKey)!;
          const summary = previous(ownCard.id, selected, scope, month);
          return summary.amount === null ? { matches: null, reasons: ["missing_performance"] } : { matches: summary.tierKey !== null, reasons: [] };
        };
        const poolsFor = (benefit: PolicyBenefit) => benefit.quotaKeys.map((key) => getPool(ownCard, selected, selected.policy.quotas.find((quota) => quota.key === key)!, row.result.day!));
        const evaluate = (benefit: PolicyBenefit, base: ReplayAmount): PolicyBenefitCandidate => calculatePolicyBenefit(benefit, base, matchPolicyConditions(benefit.conditions, matchInput), eligibilityFor(benefit), poolsFor(benefit).map((pool) => ({ ...pool, remaining: pool.remaining === null ? null : pool.remaining + (pool.consumption === "benefit_amount" ? 0 : allocations.get(pool.poolKey) ?? 0) })));
        const preliminary = new Map(selected.policy.benefits.map((benefit) => [benefit.key, evaluate(benefit, principal)]));
        const forced = new Map<string, ReplayReason[]>();
        const losing = new Set<string>();
        const potential = selected.policy.benefits.filter((benefit) => preliminary.get(benefit.key)!.result.automaticAmount !== 0);
        for (let i = 0; i < potential.length; i++) for (let j = i + 1; j < potential.length; j++) {
          const left = potential[i], right = potential[j];
          const a = left.combination, b = right.combination;
          const exclusive = a?.kind === "exclusive" && b?.kind === "exclusive" && a.group === b.group;
          const stack = a?.kind === "stack" && b?.kind === "stack" && a.with.includes(right.key) && b.with.includes(left.key);
          if (!exclusive && !stack) { forced.set(left.key, ["combination_unknown"]); forced.set(right.key, ["combination_unknown"]); }
        }
        const groups = new Set(potential.flatMap((benefit) => benefit.combination?.kind === "exclusive" ? [benefit.combination.group] : []));
        for (const group of groups) {
          const candidates = potential.filter((benefit) => benefit.combination?.kind === "exclusive" && benefit.combination.group === group).sort((a, b) => a.combination!.priority - b.combination!.priority);
          const selection = candidates[0].combination;
          if (selection?.kind !== "exclusive") continue;
          if (selection.selection === "maximum" && new Set(candidates.map((benefit) => unitKey(preliminary.get(benefit.key)!.result.unit))).size !== 1) { for (const candidate of candidates) forced.set(candidate.key, ["unit_unknown"]); continue; }
          if (selection.selection === "maximum" && candidates.some((benefit) => preliminary.get(benefit.key)!.result.automaticAmount === null) || selection.selection === "priority" && preliminary.get(candidates[0].key)!.result.automaticAmount === null) {
            for (const candidate of candidates) forced.set(candidate.key, reasons(...candidates.map((benefit) => preliminary.get(benefit.key)!.result.reasons)));
            continue;
          }
          if (selection.selection === "maximum") candidates.sort((a, b) => preliminary.get(b.key)!.result.automaticAmount! - preliminary.get(a.key)!.result.automaticAmount! || a.combination!.priority - b.combination!.priority);
          for (const candidate of candidates.slice(1)) losing.add(candidate.key);
        }
        const ordered = [...selected.policy.benefits].sort((a, b) => (a.combination?.priority ?? 0) - (b.combination?.priority ?? 0) || a.key.localeCompare(b.key));
        for (const benefit of ordered) {
          let base = principal;
          if (benefit.recognitionBasis === "net_paid") {
            const combination = benefit.combination;
            base = combination?.kind === "stack" ? finalPaidAmount(principal, row.result.benefits.filter((result) => combination.with.includes(result.key))) : unknownAmount("unsupported_condition");
          }
          const candidate = evaluate(benefit, base);
          if (forced.has(benefit.key) && candidate.result.automaticAmount !== 0) {
            candidate.result.automaticAmount = null; candidate.result.appliedAmount = null; candidate.result.status = "unknown";
            candidate.result.reasons = reasons(candidate.result.reasons, forced.get(benefit.key)!); candidate.eligibleSpend = null;
          } else if (losing.has(benefit.key)) {
            candidate.result.automaticAmount = 0; candidate.result.appliedAmount = 0; candidate.result.status = "not_selected";
          }
          const result = applyBenefitAnnotations(candidate.result, annotations);
          for (const pool of poolsFor(benefit)) {
            let consumed: number | null = result.appliedAmount;
            const prior = allocations.get(pool.poolKey) ?? 0;
            if (consumed !== null && consumed > 0 && pool.consumption === "count") consumed = prior ? 0 : 1;
            if (consumed !== null && consumed > 0 && pool.consumption === "eligible_spend") {
              consumed = candidate.eligibleSpend === null || candidate.result.status === "not_applicable" || candidate.result.status === "unmet" ? null : Math.max(0, candidate.eligibleSpend - prior);
              if (consumed === null && result.appliedSource !== "auto") pool.reasons = reasons(pool.reasons, ["annotation_allocation_unknown"]);
            }
            result.quotaConsumptions.push({ poolKey: pool.poolKey, amount: consumed });
            allocations.set(pool.poolKey, consumed === null ? null : prior + consumed);
            if (consumed === null) { pool.remaining = null; pool.consumed = null; pool.reasons = reasons(pool.reasons, result.reasons, ["quota_unknown"]); }
            else {
              if (pool.consumed !== null) pool.consumed = sumAmounts([knownAmount(pool.consumed), knownAmount(consumed)]).amount;
              if (pool.remaining !== null) pool.remaining = Math.max(0, pool.remaining - consumed);
            }
          }
          row.result.benefits.push(result);
        }
        const unallocated = row.result.unallocatedAnnotations.some((note) => note.target_kind !== "performance");
        if (unallocated) {
          row.result.reasons = reasons(row.result.reasons, ["annotation_allocation_unknown"]);
          for (const quota of selected.policy.quotas) {
            const pool = getPool(ownCard, selected, quota, row.result.day!);
            pool.remaining = null; pool.consumed = null; pool.reasons = reasons(pool.reasons, ["annotation_allocation_unknown"]);
          }
        }
      }
      for (const card of cards) {
        const targetPolicy = select(card, row.result.day!);
        if (!targetPolicy) continue;
        registerScopes(card, targetPolicy);
        for (const scope of targetPolicy.policy.performanceScopes) {
          const binding = bindingFor(inputs, card.id, targetPolicy, "performance", scope.key, scope.contributorSlots, month);
          if (!binding.contributors.includes(row.source.user_card_id ?? "")) continue;
          const key = nodeKey(card.id, scope.key, binding.instanceKey);
          const { automatic, applied } = recognitionFor(row, scope, binding);
          const why = reasons(applied.reasons, binding.reasons);
          row.result.recognized.push({ targetCardId: card.id, scopeKey: scope.key, scopeInstanceKey: binding.instanceKey, automaticAmount: automatic.amount, appliedAmount: applied.amount, source: applied.source, reasons: why });
          const node = scopes.get(key)!;
          node.ledger = sumAmounts([node.ledger, { amount: applied.amount, reasons: why }]);
        }
      }
    }
    const cardSummaries = cards.map((card) => {
      const selected = select(card, monthEnd(month));
      const performance = [...scopes.values()].filter((node) => node.card.id === card.id).map((node) => {
        const summary = summarizePerformance(node.scope, node.binding.instanceKey, node.ledger, dataFor(inputs, month, "performance", node.scope.key, node.binding.instanceKey), card.target_scope_key === node.scope.key ? card.target_tier_key : null);
        completedScopes.set(JSON.stringify([month, card.id, node.scope.key, node.binding.instanceKey]), summary);
        return summary;
      });
      const cash: ReplayAmount[] = monthRows.filter((row) => row.source.user_card_id === card.id).map((row) => {
        const amount = readIntegerAmount(row.source.actual_amount);
        return amount === null ? unknownAmount("precision_unknown") : knownAmount(amount);
      });
      for (const adjustment of inputs.adjustments.filter((row) => row.owner_id === inputs.ownerId && !row.voided_at && instant(row.occurred_at)?.month === month)) {
        const original = prepared.find((row) => row.source.id === adjustment.transaction_id);
        if (original?.source.user_card_id !== card.id) continue;
        const amount = readIntegerAmount(adjustment.amount);
        cash.push(amount === null ? unknownAmount("precision_unknown") : knownAmount(-amount));
      }
      return { userCardId: card.id, ruleVersionId: selected?.version.id ?? null,
        requirementStatus: !selected ? "unverified" as const : !selected.policy.performanceScopes.length && selected.policy.benefits.every((benefit) => benefit.performance.kind === "none") ? "no_requirement" as const : "verified" as const,
        performance, benefits: summarizeBenefits(monthRows.filter((row) => row.source.user_card_id === card.id).flatMap((row) => row.result.benefits)), cashFlow: sumAmounts(cash) };
    });
    output.months.push({ month, cards: cardSummaries, quotas: [...pools.values()].map((pool) => {
      const { definition, participantSignature, ...summary } = pool;
      void definition; void participantSignature;
      return summary;
    }) });
    if (month === throughMonth) break;
  }
  for (const row of undated) output.issues.push({ transactionId: row.source.id, reasons: row.result.reasons });
  output.transactions = allPrepared.filter((row) => !row.result.month || row.result.month >= inputs.startMonth && row.result.month <= throughMonth).map((row) => row.result);
  return output;
}
