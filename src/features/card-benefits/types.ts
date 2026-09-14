import type { UserCardRecord } from "@/features/cards/types";
import type { PaymentMethod, TransactionInput, TransactionRecord } from "@/features/transactions/types";

export type MoneyValue = number | string;
/** Postgres bigint/numeric transport values are not coerced into JS Number. */
export type RevisionValue = number | string;
export type RuleVerificationStatus = "verified" | "unverified" | "legacy_unverified";
export type ScopeKind = "performance" | "quota";

/** Select published + verified versions covering the Seoul purchase date [from, until).
 * Overlaps intentionally use highest version_order. Published rows are immutable;
 * corrections publish a higher order, never close/rewrite an old effective interval.
 * Legacy snapshots are audit-only and must not be replayed as verified policy.
 */
export type CardRuleVersionRecord = {
  id: string;
  card_id: string;
  version_label: string;
  version_order: number;
  source_url: string | null;
  effective_from: string | null;
  effective_until: string | null;
  checked_on: string | null;
  verification_status: RuleVerificationStatus;
  publication_status: "draft" | "published";
  policy_json: unknown; // Raw DB JSON: cardPolicySchema.parse is mandatory before replay/publication.
  legacy_snapshot: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
};

export type ParsedCardRuleVersionRecord = Omit<CardRuleVersionRecord, "policy_json"> & {
  policy_json: import("./policy-schema").CardPolicy;
};

/** Directed target -> contributor edges. 'self' is implicit, never stored.
 * Policies list allowed slots. Unbound non-self slots contribute no card.
 * Month intervals [valid_from_month, valid_until_month) permit overlapping scopes,
 * but the same target/version/kind/key/slot cannot bind twice in one month.
 * scope_instance_key identifies the exact aggregate, independent of a rule version.
 * Shared quotas use the same owner-local instance key across target cards;
 * performance scopes and independent quotas use a target-specific instance key.
 */
export type CardScopeMembershipRecord = {
  id: string;
  owner_id: string;
  target_user_card_id: string;
  contributor_user_card_id: string;
  rule_version_id: string;
  scope_kind: ScopeKind;
  scope_key: string;
  contributor_slot: string;
  scope_instance_key: string;
  valid_from_month: string; // SQL date YYYY-MM-01; map to MonthKey with slice(0, 7)
  valid_until_month: string | null;
  version: RevisionValue;
};

/** month is SQL date YYYY-MM-01; input JSON uses YYYY-MM. amount is nullable,
 * present only for manual_total/remaining. The two scope kinds are separate rows.
 */
export type CardMonthInputRecord = {
  id: string;
  owner_id: string;
  month: string;
  scope_instance_key: string;
  scope_key: string;
  version: RevisionValue;
  updated_at: string;
} & (
  | { scope_kind: "performance"; data_status: "manual_total"; amount: MoneyValue }
  | { scope_kind: "performance"; data_status: "complete" | "incomplete" | "before_tracking_unknown"; amount: null }
  | { scope_kind: "quota"; data_status: "remaining"; amount: MoneyValue }
  | { scope_kind: "quota"; data_status: "complete" | "unknown"; amount: null }
);

export type BenefitKind = "discount" | "cashback" | "points" | "statement_credit";
export type BenefitCalculationMethod = "percent" | "fixed_amount";
export type BenefitCapPeriod = "transaction" | "monthly" | "none";
export type BenefitApplicationSource = "auto" | "manual" | "legacy_manual";
export type PerformancePeriodType = "calendar_month";
export type PerformanceStatus = "met" | "unmet" | "no_requirement";
export type BenefitCalculationStatus =
  | "calculated"
  | "unsupported_card"
  | "no_matching_rule"
  | "missing_performance"
  | "manual_override";

export type SpendPeriod = {
  key: string;
  startDate: string;
  endDate: string;
};

export type CardBenefitRuleRecord = {
  id: string;
  card_id: string;
  name: string;
  benefit_kind: BenefitKind;
  calculation_method: BenefitCalculationMethod;
  rate: MoneyValue | null;
  fixed_amount: MoneyValue | null;
  min_payment_amount: MoneyValue;
  max_benefit_amount: MoneyValue | null;
  cap_period: BenefitCapPeriod;
  match_merchant_keywords: string[];
  match_ledger_categories: string[];
  exclude_merchant_keywords: string[];
  exclude_ledger_categories: string[];
  requires_performance: boolean;
  priority: number;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  condition_json: Record<string, unknown>;
  created_at: string;
};

export type CardPerformanceExclusionRuleRecord = {
  id: string;
  card_id: string;
  label: string;
  match_merchant_keywords: string[];
  match_ledger_categories: string[];
  exclude_if_benefit_applied: boolean;
  priority: number;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
};

export type CardPerformanceRequirementRecord = {
  id: string;
  card_id: string;
  label: string;
  required_spend_amount: MoneyValue;
  period_type: PerformancePeriodType;
  benefit_period_offset_months: number;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
};

export type TransactionBenefitApplicationRecord = {
  id: string;
  transaction_id: string;
  owner_id: string;
  user_card_id: string | null;
  card_benefit_rule_id: string | null;
  label: string | null;
  source: BenefitApplicationSource;
  benefit_amount: MoneyValue;
  eligible_spend_amount: MoneyValue;
  calculation_snapshot: Record<string, unknown>;
  created_at: string;
};

export type BenefitCalculationInput = Pick<
  TransactionInput,
  | "occurredAt"
  | "merchantName"
  | "actualAmount"
  | "benefitAmount"
  | "benefitLabel"
  | "finalAmount"
  | "paymentMethod"
  | "ledgerCategory"
  | "isPerformanceEligible"
  | "userCardId"
>;

export type BenefitCalculationContext = {
  userCard: UserCardRecord | null;
  rules: CardBenefitRuleRecord[];
  performanceExclusionRules: CardPerformanceExclusionRuleRecord[];
  requirement: CardPerformanceRequirementRecord | null;
  monthlyRuleUsage: Map<string, number>;
  isPerformanceRequirementMet: boolean;
};

export type BenefitCalculationResult = {
  source: BenefitApplicationSource;
  rule: CardBenefitRuleRecord | null;
  label: string | null;
  benefitAmount: number;
  finalAmount: number;
  eligibleSpendAmount: number;
  isPerformanceEligible: boolean;
  performanceExclusionReason: string | null;
  calculationStatus: BenefitCalculationStatus;
  calculationSnapshot: Record<string, unknown>;
};

export type CardPerformanceSummary = {
  userCard: UserCardRecord;
  requirement: CardPerformanceRequirementRecord | null;
  eligibleSpendAmount: number | null;
  requiredSpendAmount: number | null;
  remainingSpendAmount: number | null;
  benefitAmount: number | null;
  status: PerformanceStatus | "missing";
  workspace?: import("./engine-types").ReplayCardSummary;
  /** Unit/program totals and completeness from the common workspace, not FX conversion. */
  benefitDisplay?: import("@/lib/card-workspace/benefit-display").BenefitDisplay;
  manualTotalMismatches?: { month: string; scopeKey: string; amount: number | null; ledgerAmount: number | null }[];
};

export type PerformanceSummaryTransaction = Pick<
  TransactionRecord,
  "user_card_id" | "eligible_spend_amount" | "benefit_amount" | "payment_method"
> & {
  payment_method: PaymentMethod;
};
