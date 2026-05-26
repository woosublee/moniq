"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { registerUserCard } from "@/app/cards/actions";
import { initialUserCardFormState } from "@/features/cards/constants";
import type { CardRecord } from "@/features/cards/types";

export function RegisterCardForm({
  card,
  onSuccess,
}: {
  card: CardRecord;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(
    registerUserCard,
    initialUserCardFormState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.();
    }
  }, [onSuccess, state.status]);

  return (
    <form action={formAction} className="space-y-4 text-sm">
      <input type="hidden" name="cardId" value={card.id} />
      <label className="block text-slate-700">
        카드 별칭
        <input
          name="alias"
          type="text"
          maxLength={60}
          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 transition focus:border-emerald-500"
          placeholder="예: 생활비 카드, 카페 할인 카드"
        />
        <p className="mt-1.5 text-xs text-slate-500">비워두면 카드명으로 표시됩니다.</p>
      </label>

      {state.message ? (
        <p className={state.status === "success" ? "text-sm text-emerald-700" : "text-sm text-rose-600"}>
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <RegisterCardSubmitButton />
      </div>
    </form>
  );
}

function RegisterCardSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "등록 중" : "내 카드로 등록"}
    </button>
  );
}
