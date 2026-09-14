export type PaymentMethod = "cash" | "credit_card" | "check_card" | "points";
export type TransactionCalculationStatus =
  | "calculated"
  | "unsupported_card"
  | "no_matching_rule"
  | "missing_performance"
  | "manual_override";

import type { UserCardRecord } from "@/features/cards/types";

export type TransactionInput = {
  occurredAt: string;
  timezoneOffset: number;
  merchantName: string;
  amount: number;
  actualAmount: number;
  benefitLabel: string;
  benefitAmount: number;
  finalAmount: number;
  paymentMethod: PaymentMethod;
  userCardId: string | null;
  isPerformanceEligible: boolean;
  ledgerCategory: string;
  isFixedCost: boolean;
  memo: string;
};

export type TransactionInsert = {
  owner_id: string;
  occurred_at: string;
  merchant_name: string;
  merchant_normalized_name: string | null;
  performance_exclusion_reason: string | null;
  calculation_status: TransactionCalculationStatus;
  amount: number;
  actual_amount: number;
  benefit_label: string | null;
  benefit_amount: number;
  final_amount: number;
  eligible_spend_amount: number;
  is_performance_eligible: boolean;
  payment_method: PaymentMethod;
  ledger_category: string | null;
  is_fixed_cost: boolean;
  user_card_id: string | null;
  memo: string | null;
};

export type TransactionFormState = {
  status: "idle" | "success" | "error" | "saved_needs_review" | "outcome_unknown";
  message: string;
  requestId?: string;
  resultIds?: string[];
  feedback?: { transactionId: string; benefit: string; performance: string; notice: string };
  fieldErrors?: Partial<Record<Exclude<keyof TransactionInput, "timezoneOffset">, string[]>>;
};

export type TransactionSourceFields = {
  origin: "new" | "legacy";
  version: import("@/features/card-benefits/types").RevisionValue;
  stable_sequence: import("@/features/card-benefits/types").RevisionValue;
  payment_channel: import("@/features/card-benefits/policy-schema").PaymentChannel;
  installment_months: number | null;
  input_excluded: boolean;
  legacy_review_required: boolean;
};

export type TransactionRecord = Partial<TransactionSourceFields> & {
  workspace?: import("@/lib/card-workspace/view-model").WorkspaceTransactionValues;
  id: string;
  owner_id: string;
  occurred_at: string;
  merchant_name: string;
  merchant_normalized_name: string | null;
  performance_exclusion_reason: string | null;
  calculation_status: TransactionCalculationStatus;
  amount: number | string;
  actual_amount: number | string;
  benefit_label: string | null;
  benefit_amount: number | string;
  final_amount: number | string;
  eligible_spend_amount: number | string;
  is_performance_eligible: boolean;
  payment_method: PaymentMethod;
  ledger_category: string | null;
  is_fixed_cost: boolean;
  user_card_id: string | null;
  memo: string | null;
  user_cards?: UserCardRecord | null;
  transaction_benefit_applications?: {
    id: string;
    transaction_id: string;
    owner_id: string;
    user_card_id: string | null;
    card_benefit_rule_id: string | null;
    label: string | null;
    source: "auto" | "manual" | "legacy_manual";
    benefit_amount: number | string;
    eligible_spend_amount: number | string;
    calculation_snapshot: Record<string, unknown>;
    created_at: string;
  }[] | null;
};

export type LedgerTransactionRecord = TransactionRecord & TransactionSourceFields;

export type TransactionAdjustmentRecord = {
  id: string;
  owner_id: string;
  transaction_id: string;
  kind: "refund";
  occurred_at: string;
  amount: import("@/features/card-benefits/types").MoneyValue;
  origin: "new" | "legacy";
  version: import("@/features/card-benefits/types").RevisionValue;
  stable_sequence: import("@/features/card-benefits/types").RevisionValue;
  memo: string | null;
  voided_at: string | null;
  created_at: string;
};

/** amount is the deliberate override. basis_* is audit evidence ONLY, never
 * a replay input. target_kind semantics:
 * - performance: recognized spend for the exact performance scope instance.
 * - benefit_eligible: FIXED AMOUNT override of the automatic estimated benefit,
 *   NOT the spend eligible for a benefit. Kept independently from confirmed_benefit.
 * - confirmed_benefit: separately recorded confirmed benefit, including explicit zero.
 * Both benefit amounts can coexist for the same target_key; neither overwrites the other.
 * Legacy needs_review remains unresolved even with target_kind='confirmed_benefit';
 * consumers must not label it confirmed until review_status is resolved.
 */
export type TransactionAnnotationRecord = {
  id: string;
  owner_id: string;
  transaction_id: string;
  target_kind: "performance" | "benefit_eligible" | "confirmed_benefit";
  target_key: string | null;
  scope_instance_key: string | null; // Required for resolved performance overrides.
  amount: import("@/features/card-benefits/types").MoneyValue;
  origin: "manual" | "legacy_manual";
  review_status: "resolved" | "needs_review";
  basis_auto_amount: import("@/features/card-benefits/types").MoneyValue | null;
  basis_input_revision: import("@/features/card-benefits/types").RevisionValue | null;
  basis_rule_version_id: string | null;
  legacy_application_id: string | null;
  legacy_snapshot: Record<string, unknown> | null;
  version: import("@/features/card-benefits/types").RevisionValue;
  voided_at: string | null;
  created_at: string;
};

export type OwnerLedgerRevisionRecord = {
  owner_id: string;
  revision: import("@/features/card-benefits/types").RevisionValue;
};
export type LedgerMutationLogRecord = {
  id: string;
  owner_id: string;
  request_id: string;
  request_hash: string;
  owner_revision: import("@/features/card-benefits/types").RevisionValue;
  mutation_kind: string;
  before_source: Record<string, unknown> | null;
  after_source: Record<string, unknown> | null;
  result_ids: string[];
  created_at: string;
};

export type TransactionFilters = {
  startDate?: string;
  endDate?: string;
  paymentMethod?: PaymentMethod | "all";
  userCardId?: string;
  timezoneOffset?: string;
};
