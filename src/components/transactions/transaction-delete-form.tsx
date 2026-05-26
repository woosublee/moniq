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
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        aria-label="삭제"
        title="삭제"
      >
        ×
      </button>
      {state.status === "error" ? (
        <span className="max-w-28 text-right text-[10px] leading-4 text-rose-600">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
