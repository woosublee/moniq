"use client";

import { useActionState } from "react";

import { registerUserCard } from "@/app/cards/actions";
import { initialUserCardFormState } from "@/features/cards/constants";
import type { CardRecord } from "@/features/cards/types";

export function RegisterCardForm({
  card,
  disabled = false,
}: {
  card: CardRecord;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(
    registerUserCard,
    initialUserCardFormState,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <input type="hidden" name="cardId" value={card.id} />
      <div>
        <p className="text-sm font-medium text-white">{card.issuer} {card.name}</p>
        <p className="mt-1 text-xs text-blue-100/65">
          {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
          {card.network ? ` · ${card.network}` : ""}
        </p>
      </div>
      <label className="block text-sm text-blue-50/82">
        내 카드 별칭
        <input
          name="alias"
          type="text"
          disabled={disabled}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none placeholder:text-blue-100/35 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="예: 주력 생활비 카드"
        />
      </label>
      {disabled ? (
        <p className="text-xs text-cyan-200">이미 내 카드에 등록된 카드입니다.</p>
      ) : state.message ? (
        <p className={state.status === "success" ? "text-xs text-emerald-200" : "text-xs text-rose-200"}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-11 items-center justify-center rounded-full bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
      >
        {disabled ? "이미 등록됨" : "내 카드로 등록"}
      </button>
    </form>
  );
}
