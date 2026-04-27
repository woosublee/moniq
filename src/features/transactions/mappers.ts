import type { TransactionInput, TransactionInsert } from "@/features/transactions/types";

export const toTransactionInsert = (
  input: TransactionInput,
): TransactionInsert => ({
  occurred_at: input.occurredAt,
  merchant_name: input.merchantName,
  amount: input.amount,
  actual_amount: input.actualAmount,
  benefit_label: input.benefitLabel || null,
  benefit_amount: input.benefitAmount,
  final_amount: input.finalAmount,
  eligible_spend_amount: input.amount,
  is_performance_eligible: input.isPerformanceEligible,
  payment_method: input.paymentMethod,
  ledger_category: input.ledgerCategory || null,
  is_fixed_cost: input.isFixedCost,
  user_card_id: input.userCardId,
  memo: input.memo || null,
});
