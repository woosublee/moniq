"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { updateTransaction } from "@/app/transactions/new/actions";
import { TransactionDeleteForm } from "@/components/transactions/transaction-delete-form";
import { TransactionForm } from "@/components/transactions/transaction-form";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionRecord } from "@/features/transactions/types";

export function TransactionEditDialog({
  transaction,
  userCards,
  trigger,
}: {
  transaction: TransactionRecord;
  userCards: UserCardRecord[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const canUsePortal = typeof document !== "undefined";

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="block"
      >
        {trigger ?? (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="수정"
            title="수정"
          >
            ✎
          </span>
        )}
      </div>

      {open && canUsePortal
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/15 sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">지출 내역 수정</p>
                    <p className="mt-2 text-sm text-slate-500">
                      금액, 카드, 혜택 정보를 실제 결제 내역에 맞게 고쳐주세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-600 transition hover:bg-slate-50"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>

                <TransactionForm
                  userCards={userCards}
                  defaultUserCardId={transaction.user_card_id}
                  compact
                  initialTransaction={transaction}
                  action={updateTransaction.bind(null, transaction.id)}
                  onSuccess={() => setOpen(false)}
                />
                <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
                  <TransactionDeleteForm transactionId={transaction.id} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
