import { calculateTransactionBenefit } from "@/features/card-benefits/calculation";
import type {
  BenefitCalculationContext,
  BenefitCalculationResult,
} from "@/features/card-benefits/types";
import { normalizeMerchant } from "@/features/merchants/normalize";
import type { MerchantRuleRecord } from "@/features/merchants/types";
import type { TransactionInput } from "@/features/transactions/types";

import { readIntegerAmount } from "@/features/card-benefits/money";
import type { ReplayAmount, ReplayBenefit, ReplayReason } from "@/features/card-benefits/engine-types";
import type { TransactionAnnotationRecord } from "./types";

/** Audit basis snapshots are intentionally never read here. Resolved zero is a value. */
export function applyBenefitAnnotations(result: ReplayBenefit, annotations: readonly TransactionAnnotationRecord[]): ReplayBenefit {
  const matching = annotations.filter((note) => !note.voided_at && note.target_kind !== "performance" && (note.target_key === result.key || note.target_key === null));
  const fixed = matching.filter((note) => note.review_status === "resolved" && note.target_key === result.key && note.target_kind === "benefit_eligible");
  const confirmed = matching.filter((note) => note.review_status === "resolved" && note.target_key === result.key && note.target_kind === "confirmed_benefit");
  const extra: ReplayReason[] = matching.some((note) => note.review_status === "needs_review") ? ["annotation_needs_review"] : [];
  const selected = confirmed.length === 1 ? confirmed[0] : fixed.length === 1 ? fixed[0] : null;
  const conflicting = fixed.length > 1 || confirmed.length > 1;
  const amount = conflicting ? null : selected ? readIntegerAmount(selected.amount) : result.appliedAmount;
  if (selected && amount === null) extra.push("precision_unknown");
  if (conflicting) extra.push("annotation_allocation_unknown");
  return { ...result, estimatedOverride: fixed.length === 1 ? fixed[0].amount : null, confirmedBenefit: confirmed.length === 1 ? confirmed[0].amount : null,
    appliedAmount: amount, appliedSource: selected ? selected.target_kind === "confirmed_benefit" ? "confirmed" : "estimated_override" : result.appliedSource,
    reasons: [...new Set([...result.reasons, ...extra])].sort() };
}

export function applyPerformanceAnnotations(automatic: ReplayAmount, scopeKey: string, instanceKey: string, annotations: readonly TransactionAnnotationRecord[]): ReplayAmount & { source: "auto" | "manual" } {
  const notes = annotations.filter((note) => !note.voided_at && note.target_kind === "performance" && note.review_status === "resolved" && note.target_key === scopeKey && note.scope_instance_key === instanceKey);
  if (!notes.length) return { ...automatic, source: "auto" };
  if (notes.length > 1) return { amount: null, reasons: ["annotation_allocation_unknown"], source: "manual" };
  const amount = readIntegerAmount(notes[0].amount);
  return { amount, source: "manual", reasons: amount === null ? ["precision_unknown"] : [] };
}

export type TransactionCalculationResult = BenefitCalculationResult & {
  merchantNormalizedName: string;
  ledgerCategory: string;
};

export function calculateTransaction(
  input: TransactionInput,
  context: BenefitCalculationContext,
  merchantRules: MerchantRuleRecord[],
): TransactionCalculationResult {
  const merchant = normalizeMerchant(input.merchantName, merchantRules);
  const normalizedInput = {
    ...input,
    merchantName: merchant.normalizedMerchantName,
    ledgerCategory: input.ledgerCategory || merchant.ledgerCategory,
  };
  const result = calculateTransactionBenefit(normalizedInput, context);

  return {
    ...result,
    merchantNormalizedName: merchant.normalizedMerchantName,
    ledgerCategory: normalizedInput.ledgerCategory,
  };
}
