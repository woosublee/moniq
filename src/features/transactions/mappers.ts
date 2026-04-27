import type { TransactionInput, TransactionInsert } from "@/features/transactions/types";

const toUtcIsoString = (localDatetime: string, timezoneOffset: number) => {
  const localDate = new Date(`${localDatetime}:00Z`);

  return new Date(localDate.getTime() + timezoneOffset * 60_000).toISOString();
};

export const toTransactionInsert = (
  ownerId: string,
  input: TransactionInput,
): TransactionInsert => ({
  owner_id: ownerId,
  occurred_at: toUtcIsoString(input.occurredAt, input.timezoneOffset),
  merchant_name: input.merchantName,
  amount: input.amount,
  actual_amount: input.actualAmount,
  benefit_label: input.benefitLabel || null,
  benefit_amount: input.benefitAmount,
  final_amount: input.finalAmount,
  eligible_spend_amount: input.isPerformanceEligible ? input.finalAmount : 0,
  is_performance_eligible: input.isPerformanceEligible,
  payment_method: input.paymentMethod,
  ledger_category: input.ledgerCategory || null,
  is_fixed_cost: input.isFixedCost,
  user_card_id: input.userCardId,
  memo: input.memo || null,
});
