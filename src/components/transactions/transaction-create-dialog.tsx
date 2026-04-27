"use client";

import { useState } from "react";

import type { UserCardRecord } from "@/features/cards/types";
import { TransactionForm } from "@/components/transactions/transaction-form";

export function TransactionCreateDialog({
  userCards,
  defaultUserCardId,
  variant = "inline",
}: {
  userCards: UserCardRecord[];
  defaultUserCardId: string | null;
  variant?: "inline" | "floating";
}) {
  const [open, setOpen] = useState(false);
  const buttonClassName =
    variant === "floating"
      ? "fixed bottom-5 right-5 z-50 inline-flex h-14 items-center justify-center rounded-full bg-slate-950 px-6 text-sm font-semibold text-white shadow-xl shadow-slate-950/20 transition hover:bg-slate-800 sm:bottom-8 sm:right-8"
      : "inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        + 지출 추가
      </button>

      {open ? (
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
                <p className="text-lg font-semibold text-slate-950">새 지출 기록</p>
                <p className="mt-2 text-sm text-slate-500">
                  금액, 사용처, 결제수단을 입력해 오늘 쓴 돈을 정리하세요.
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
