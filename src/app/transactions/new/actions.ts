"use server";

import { revalidatePath } from "next/cache";

import { initialTransactionFormState } from "@/features/transactions/constants";
import { toTransactionInsert } from "@/features/transactions/mappers";
import type { TransactionFormState } from "@/features/transactions/types";
import { parseTransactionInput } from "@/features/transactions/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const revalidateTransactions = () => {
  revalidatePath("/transactions/new");
};

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const parsed = parseTransactionInput({
    occurredAt: formData.get("occurredAt"),
    merchantName: formData.get("merchantName"),
    amount: formData.get("amount"),
    actualAmount: formData.get("actualAmount"),
    benefitLabel: formData.get("benefitLabel"),
    benefitAmount: formData.get("benefitAmount"),
    finalAmount: formData.get("finalAmount"),
    paymentMethod: formData.get("paymentMethod"),
    userCardId: formData.get("userCardId"),
    isPerformanceEligible: formData.get("isPerformanceEligible"),
    ledgerCategory: formData.get("ledgerCategory"),
    isFixedCost: formData.get("isFixedCost"),
    memo: formData.get("memo"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "입력값을 다시 확인해 주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = createSupabaseServerClient();
    const payload = toTransactionInsert(parsed.data);
    const { error } = await supabase.from("transactions").insert(payload);

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }

    revalidateTransactions();

    return {
      status: "success",
      message: "거래가 저장되었습니다.",
    };
  } catch (error) {
    return {
      ...initialTransactionFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "거래 저장 중 알 수 없는 오류가 발생했습니다.",
    };
  }
}

export async function updateTransaction(
  transactionId: string,
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const parsed = parseTransactionInput({
    occurredAt: formData.get("occurredAt"),
    merchantName: formData.get("merchantName"),
    amount: formData.get("amount"),
    actualAmount: formData.get("actualAmount"),
    benefitLabel: formData.get("benefitLabel"),
    benefitAmount: formData.get("benefitAmount"),
    finalAmount: formData.get("finalAmount"),
    paymentMethod: formData.get("paymentMethod"),
    userCardId: formData.get("userCardId"),
    isPerformanceEligible: formData.get("isPerformanceEligible"),
    ledgerCategory: formData.get("ledgerCategory"),
    isFixedCost: formData.get("isFixedCost"),
    memo: formData.get("memo"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "입력값을 다시 확인해 주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = createSupabaseServerClient();
    const payload = toTransactionInsert(parsed.data);
    const { error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", transactionId);

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }

    revalidateTransactions();

    return {
      status: "success",
      message: "거래가 수정되었습니다.",
    };
  } catch (error) {
    return {
      ...initialTransactionFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "거래 수정 중 알 수 없는 오류가 발생했습니다.",
    };
  }
}

export async function deleteTransaction(transactionId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateTransactions();
}
