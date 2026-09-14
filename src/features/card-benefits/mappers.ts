import type {
  BenefitCalculationResult,
  TransactionBenefitApplicationRecord,
} from "@/features/card-benefits/types";

export type TransactionBenefitApplicationInsert = {
  transaction_id: string;
  owner_id: string;
  user_card_id: string | null;
  card_benefit_rule_id: string | null;
  label: string | null;
  source: TransactionBenefitApplicationRecord["source"];
  benefit_amount: number;
  eligible_spend_amount: number;
  calculation_snapshot: Record<string, unknown>;
};

export const toTransactionBenefitApplicationInsert = ({
  transactionId,
  ownerId,
  userCardId,
  result,
}: {
  transactionId: string;
  ownerId: string;
  userCardId: string | null;
  result: BenefitCalculationResult;
}): TransactionBenefitApplicationInsert | null => {
  if (result.benefitAmount <= 0 && !result.rule) {
    return null;
  }

  return {
    transaction_id: transactionId,
    owner_id: ownerId,
    user_card_id: userCardId,
    card_benefit_rule_id: result.rule?.id ?? null,
    label: result.label,
    source: result.source,
    benefit_amount: result.benefitAmount,
    eligible_spend_amount: result.eligibleSpendAmount,
    calculation_snapshot: result.calculationSnapshot,
  };
};
