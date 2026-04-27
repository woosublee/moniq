"use client";

import { useState } from "react";

import type { UserCardRecord } from "@/features/cards/types";
import { TransactionForm } from "@/components/transactions/transaction-form";

export function TransactionCreateDialog({
  userCards,
  defaultUserCardId,
}: {
  userCards: UserCardRecord[];
  defaultUserCardId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
      >
        지출 추가
      </button>

      {open ? (
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
                <p className="text-lg font-semibold text-white">새 지출 기록</p>
                <p className="mt-2 text-sm text-blue-100/72">
                  금액, 사용처, 결제수단을 입력해 오늘 쓴 돈을 정리하세요.
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
              defaultUserCardId={defaultUserCardId}
              compact
              onSuccess={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
