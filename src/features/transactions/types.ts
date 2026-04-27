export type PaymentMethod = "cash" | "credit_card" | "check_card" | "points";

import type { UserCardRecord } from "@/features/cards/types";

export type TransactionInput = {
  occurredAt: string;
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
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<keyof TransactionInput, string[]>>;
};

export type TransactionRecord = {
  id: string;
  owner_id: string;
  occurred_at: string;
  merchant_name: string;
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
};

export type TransactionFilters = {
  startDate?: string;
  endDate?: string;
  paymentMethod?: PaymentMethod | "all";
  userCardId?: string;
};
