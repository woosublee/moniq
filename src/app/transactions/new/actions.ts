"use server";

import { revalidatePath } from "next/cache";

import { initialTransactionFormState } from "@/features/transactions/constants";
import { toTransactionInsert } from "@/features/transactions/mappers";
import type { TransactionFormState } from "@/features/transactions/types";
import { parseTransactionInput } from "@/features/transactions/validation";
import { serverEnv } from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const revalidateTransactions = () => {
  revalidatePath("/transactions/new");
};

const parseTransactionFormData = (formData: FormData) =>
  parseTransactionInput({
    occurredAt: formData.get("occurredAt"),
    timezoneOffset: formData.get("timezoneOffset"),
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

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const parsed = parseTransactionFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "입력값을 다시 확인해 주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = createSupabaseServerClient();
    const payload = toTransactionInsert(serverEnv.moniqOwnerId, parsed.data);
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
      message: "지출이 저장되었습니다.",
    };
  } catch (error) {
    return {
      ...initialTransactionFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "지출을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function updateTransaction(
  transactionId: string,
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const parsed = parseTransactionFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "입력값을 다시 확인해 주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = createSupabaseServerClient();
    const payload = toTransactionInsert(serverEnv.moniqOwnerId, parsed.data);
    const { error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", transactionId)
      .eq("owner_id", serverEnv.moniqOwnerId);

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }

    revalidateTransactions();

    return {
      status: "success",
      message: "지출 내역이 수정되었습니다.",
    };
  } catch (error) {
    return {
      ...initialTransactionFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "지출 내역을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function deleteTransaction(
  transactionId: string,
): Promise<TransactionFormState> {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId)
      .eq("owner_id", serverEnv.moniqOwnerId);

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }

    revalidateTransactions();

    return {
      status: "success",
      message: "지출 내역이 삭제되었습니다.",
    };
  } catch (error) {
    return {
      ...initialTransactionFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "지출 내역을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
