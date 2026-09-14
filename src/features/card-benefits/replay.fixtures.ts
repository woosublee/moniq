// Synthetic test inputs only. Production modules must not import this file.
import type { CardInstanceRecord } from "@/features/cards/types";
import type { LedgerTransactionRecord, TransactionAdjustmentRecord, TransactionAnnotationRecord } from "@/features/transactions/types";
import type { ReplayInputs } from "./engine-types";
import type { CardMonthInputRecord, CardRuleVersionRecord, CardScopeMembershipRecord } from "./types";
import type { CardPolicy } from "./policy-schema";

export function policy(overrides: Partial<CardPolicy> = {}): CardPolicy {
  return {
    schemaVersion: 1,
    performanceScopes: [{ key: "spend", contributorSlots: ["self"], basis: "gross", exclusions: [], tiers: [{ key: "base", minimumSpend: 300000 }, { key: "plus", minimumSpend: 600000 }] }],
    quotas: [],
    benefits: [{ key: "base", benefitKind: "discount", reward: { kind: "percent", basisPoints: 500, rounding: "floor" }, performance: { kind: "previous_month", scopeKey: "spend" }, conditions: [], recognitionBasis: "gross", quotaKeys: [], transactionLimit: null }],
    cancellation: { kind: "verified_original_month_net_replay" },
    ...overrides,
  };
}
export function card(id = "a"): CardInstanceRecord {
  return {
    id, owner_id: "synthetic-owner", card_id: `product-${id}`, version: "1", alias: null, is_default: false,
    created_at: "2026-01-01T00:00:00Z", last_four: null, issued_on: null, tracking_started_on: "2026-01-01", sort_order: 0, archived_at: null, target_scope_key: null, target_tier_key: null,
    card: { id: `product-${id}`, issuer: "Synthetic", name: `Synthetic ${id}`, card_type: "credit_card", network: null, annual_fee: null, image_url: null, benefit_support_status: "partial", benefit_summary: null, searchable_text: "", created_at: "2026-01-01T00:00:00Z" },
  };
}
export function version(cardId = "a", rules = policy(), overrides: Partial<CardRuleVersionRecord> = {}): CardRuleVersionRecord {
  return { id: `v-${cardId}`, card_id: `product-${cardId}`, version_label: "Synthetic 1", version_order: 1,
    source_url: null, effective_from: "2026-01-01", effective_until: null, checked_on: "2026-01-01",
    verification_status: "verified", publication_status: "published", policy_json: rules, legacy_snapshot: null,
    published_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", ...overrides };
}
export function transaction(id: string, amount = 10000, at = "2026-02-02T01:00:00Z", cardId = "a", sequence: number | string = 1): LedgerTransactionRecord {
  return { id, owner_id: "synthetic-owner", occurred_at: at, merchant_name: "Synthetic Shop", merchant_normalized_name: null,
    amount, actual_amount: amount, benefit_label: "stale automatic", benefit_amount: 99999, final_amount: 1, eligible_spend_amount: 1,
    is_performance_eligible: true, payment_method: "credit_card", ledger_category: null, is_fixed_cost: false,
    user_card_id: cardId, memo: null, performance_exclusion_reason: null, calculation_status: "calculated",
    origin: "new", version: 1, stable_sequence: sequence, payment_channel: "offline", installment_months: 1, input_excluded: false, legacy_review_required: false };
}
export function monthData(month: string, kind: "performance" | "quota" = "performance", key = "spend", data: { status: string; amount?: number | string } = { status: "complete" }, instance = `card:a:${kind}:${key}`): CardMonthInputRecord {
  return { id: `${month}:${kind}:${instance}:${key}`, owner_id: "synthetic-owner", month: `${month}-01`, scope_kind: kind, scope_key: key, scope_instance_key: instance, data_status: data.status, amount: data.amount ?? null, version: 1, updated_at: "2026-02-01T00:00:00Z" } as CardMonthInputRecord;
}
export function inputs(overrides: Partial<ReplayInputs> = {}): ReplayInputs {
  return { ownerId: "synthetic-owner", startMonth: "2026-01", cards: [card()], ruleVersions: [version()], memberships: [], transactions: [], adjustments: [], annotations: [], monthInputs: [monthData("2026-01"), monthData("2026-02"), monthData("2026-03")], merchantRules: [], ...overrides };
}
export function annotation(transactionId: string, amount: number | string, targetKind: TransactionAnnotationRecord["target_kind"] = "benefit_eligible", overrides: Partial<TransactionAnnotationRecord> = {}): TransactionAnnotationRecord {
  return { id: `note-${transactionId}-${targetKind}`, owner_id: "synthetic-owner", transaction_id: transactionId, target_kind: targetKind, target_key: "base", scope_instance_key: null, amount, origin: "manual", review_status: "resolved", basis_auto_amount: 99999, basis_input_revision: 1, basis_rule_version_id: "v-a", legacy_application_id: null, legacy_snapshot: null, version: 1, voided_at: null, created_at: "2026-02-03T00:00:00Z", ...overrides };
}
export function refund(transactionId: string, amount: number | string, at = "2026-03-02T00:00:00Z", overrides: Partial<TransactionAdjustmentRecord> = {}): TransactionAdjustmentRecord {
  return { id: `refund-${transactionId}`, owner_id: "synthetic-owner", transaction_id: transactionId, kind: "refund", occurred_at: at, amount, origin: "new", version: 1, stable_sequence: 100, memo: null, voided_at: null, created_at: at, ...overrides };
}
export function membership(target = "a", contributor = "b", kind: "performance" | "quota" = "performance", key = "spend", instance = `card:${target}:${kind}:${key}`, overrides: Partial<CardScopeMembershipRecord> = {}): CardScopeMembershipRecord {
  return { id: `${target}-${contributor}-${kind}-${key}`, owner_id: "synthetic-owner", target_user_card_id: target, contributor_user_card_id: contributor, rule_version_id: `v-${target}`, scope_kind: kind, scope_key: key, contributor_slot: "partner", scope_instance_key: instance, valid_from_month: "2026-01-01", valid_until_month: null, version: 1, ...overrides };
}
