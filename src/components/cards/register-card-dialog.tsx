"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { RegisterCardForm } from "@/components/cards/register-card-form";
import type { CardRecord } from "@/features/cards/types";

export function RegisterCardDialog({ card }: { card: CardRecord }) {
  const [open, setOpen] = useState(false);
  const canUsePortal = typeof document !== "undefined";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        내 카드로 등록
      </button>

      {open && canUsePortal
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="max-h-[calc(100vh-4rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/15"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">내 카드로 등록</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {card.issuer} {card.name}을 지출 입력에 사용할 카드로 추가합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-950">
                    {card.issuer} {card.name}
                  </p>
                  <p className="mt-1">
                    {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
                    {card.network ? ` · ${card.network}` : ""}
                    {typeof card.annual_fee === "number" ? ` · 연회비 ${card.annual_fee.toLocaleString("ko-KR")}원` : ""}
                  </p>
                </div>

                <RegisterCardForm card={card} onSuccess={() => setOpen(false)} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
