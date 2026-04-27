"use client";

import { useActionState } from "react";

import { deleteTransaction } from "@/app/transactions/new/actions";
import { initialTransactionFormState } from "@/features/transactions/constants";

export function TransactionDeleteForm({ transactionId }: { transactionId: string }) {
  const [state, formAction] = useActionState(
    deleteTransaction.bind(null, transactionId),
    initialTransactionFormState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        className="inline-flex h-8 items-center justify-center rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 text-[11px] font-medium text-rose-100 transition hover:bg-rose-400/20"
      >
        삭제
      </button>
      {state.status === "error" ? (
        <span className="max-w-28 text-right text-[10px] leading-4 text-rose-200">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
