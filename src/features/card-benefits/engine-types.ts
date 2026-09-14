import type { CardInstanceRecord } from "@/features/cards/types";
import type { MerchantRuleRecord } from "@/features/merchants/types";
import type { LedgerTransactionRecord, TransactionAdjustmentRecord, TransactionAnnotationRecord } from "@/features/transactions/types";
import type { CardMonthInputRecord, CardRuleVersionRecord, CardScopeMembershipRecord, MoneyValue } from "./types";
import type { CardPolicy } from "./policy-schema";
import type { MonthKey } from "./periods";

export type RewardUnit = NonNullable<CardPolicy["benefits"][number]["unit"]>;
export type PolicyBenefit = CardPolicy["benefits"][number];
export type PolicyScope = CardPolicy["performanceScopes"][number];
export type PolicyQuota = CardPolicy["quotas"][number];
export type ReplayReason = "policy_unverified" | "invalid_policy" | "missing_performance" | "incomplete_data" | "precision_unknown" | "merchant_unknown" | "merchant_ambiguous" | "channel_unknown" | "installment_unknown" | "category_unknown" | "quota_unknown" | "quota_definition_conflict" | "scope_binding_unknown" | "ordering_unknown" | "refund_policy_unknown" | "unsupported_condition" | "cyclic_performance_dependency" | "unsupported_performance_dependency" | "unit_unknown" | "combination_unknown" | "annotation_needs_review" | "annotation_allocation_unknown" | "manual_total_mismatch";
export type ReplayAmount = { amount: number | null; reasons: ReplayReason[] };
export type MerchantMatch = {
  status: "exact" | "ambiguous" | "unknown";
  normalizedName: string;
  category: string | null;
  candidates: string[];
};
export type ReplayInputs = {
  ownerId: string;
  startMonth: MonthKey;
  cards: readonly CardInstanceRecord[];
  ruleVersions: readonly CardRuleVersionRecord[];
  memberships: readonly CardScopeMembershipRecord[];
  transactions: readonly LedgerTransactionRecord[];
  adjustments: readonly TransactionAdjustmentRecord[];
  annotations: readonly TransactionAnnotationRecord[];
  monthInputs: readonly CardMonthInputRecord[];
  merchantRules: readonly MerchantRuleRecord[];
};
export type ReplayBenefit = {
  key: string;
  benefitKind: PolicyBenefit["benefitKind"];
  unit: RewardUnit | null;
  automaticAmount: number | null;
  estimatedOverride: MoneyValue | null;
  confirmedBenefit: MoneyValue | null;
  appliedAmount: number | null;
  appliedSource: "auto" | "estimated_override" | "confirmed";
  status: "calculated" | "not_applicable" | "unmet" | "not_selected" | "unknown";
  reasons: ReplayReason[];
  quotaConsumptions: { poolKey: string; amount: number | null }[];
};
export type ReplayRecognition = {
  targetCardId: string;
  scopeKey: string;
  scopeInstanceKey: string;
  automaticAmount: number | null;
  appliedAmount: number | null;
  source: "auto" | "manual";
  reasons: ReplayReason[];
};
export type ReplayTransaction = {
  id: string;
  userCardId: string | null;
  month: MonthKey | null;
  day: string | null;
  ruleVersionId: string | null;
  merchant: MerchantMatch;
  netAmount: number | null;
  unresolvedAnnotations: TransactionAnnotationRecord[];
  /** Active source annotations with no exact current benefit or contributing scope target. */
  unallocatedAnnotations: TransactionAnnotationRecord[];
  benefits: ReplayBenefit[];
  recognized: ReplayRecognition[];
  reasons: ReplayReason[];
};
export type ScopeSummary = {
  scopeKey: string;
  scopeInstanceKey: string;
  ledgerAmount: number | null;
  amount: number | null;
  source: "ledger" | "manual_total" | null;
  status: "missing" | "known_zero" | "unmet" | "met" | "highest_tier";
  tierKey: string | null;
  nextTierKey: string | null;
  remaining: number | null;
  target: { tierKey: string; status: "met" | "unmet" | "unknown"; remaining: number | null } | null;
  reasons: ReplayReason[];
};
export type UnitTotal = ReplayAmount & { unit: RewardUnit | null };
export type ReplayQuotaSummary = {
  poolKey: string;
  scopeInstanceKey: string;
  scopeKey: string;
  period: "daily" | "monthly";
  periodKey: string;
  consumption: "benefit_amount" | "eligible_spend" | "count";
  unit: RewardUnit | null;
  cap: number | null;
  consumed: number | null;
  remaining: number | null;
  reasons: ReplayReason[];
};
export type ReplayCardSummary = {
  userCardId: string;
  ruleVersionId: string | null;
  requirementStatus: "verified" | "unverified" | "no_requirement";
  performance: ScopeSummary[];
  benefits: UnitTotal[];
  cashFlow: ReplayAmount;
};
export type ReplayResult = {
  transactions: ReplayTransaction[];
  months: { month: MonthKey; cards: ReplayCardSummary[]; quotas: ReplayQuotaSummary[] }[];
  issues: { transactionId: string | null; reasons: ReplayReason[] }[];
};
