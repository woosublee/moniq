"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { updateTransaction } from "@/app/transactions/new/actions";
import { TransactionForm } from "@/components/transactions/transaction-form";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionRecord } from "@/features/transactions/types";

export function TransactionEditDialog({
  transaction,
  userCards,
}: {
  transaction: TransactionRecord;
  userCards: UserCardRecord[];
}) {
  const [open, setOpen] = useState(false);
  const canUsePortal = typeof document !== "undefined";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center justify-center rounded-full border border-white/12 bg-white/6 px-2.5 text-[11px] font-medium text-blue-50 transition hover:bg-white/10"
      >
        수정
      </button>

      {open && canUsePortal
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="w-full max-w-4xl rounded-[28px] border border-white/10 bg-[#071120] p-6 shadow-2xl shadow-black/40"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">지출 내역 수정</p>
                    <p className="mt-2 text-sm text-blue-100/72">
                      금액, 카드, 혜택 정보를 실제 결제 내역에 맞게 고쳐주세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/6 text-lg text-white transition hover:bg-white/10"
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
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
