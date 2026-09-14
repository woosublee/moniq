"use client";

import { useEffect } from "react";

import { registerUserCard } from "@/app/cards/actions";
import { LedgerRequestFields, useLedgerActionState } from "@/components/transactions/ledger-request-fields";
import { initialUserCardFormState } from "@/features/cards/constants";
import type { CardRecord } from "@/features/cards/types";

export function RegisterCardForm({
  card,
  onSuccess,
  onLockChange,
  month,
}: {
  card: CardRecord;
  month?: string;
  onSuccess?: () => void;
  onLockChange?: (locked: boolean) => void;
}) {
  const [state, formAction, pending, onSubmit] = useLedgerActionState(
    registerUserCard,
    initialUserCardFormState,
    { create: true, month },
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.();
    }
  }, [onSuccess, state.status]);

  const complete = state.status === "success" || state.status === "saved_needs_review";
  useEffect(() => { onLockChange?.(pending || state.status === "outcome_unknown"); }, [pending, state.status, onLockChange]);
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate={state.status === "outcome_unknown"} className="space-y-4 text-sm">
      <LedgerRequestFields create month={month} state={state} />
      <input type="hidden" name="cardId" value={card.id} />
      <label className="block text-slate-700">
        카드 별칭
        <input
          name="alias"
          disabled={pending || complete || state.status === "outcome_unknown"}
          type="text"
          maxLength={60}
          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 transition focus:border-emerald-500"
          placeholder="예: 생활비 카드, 카페 할인 카드"
        />
        <p className="mt-1.5 text-xs text-slate-500">비워두면 카드명으로 표시됩니다.</p>
      </label>

      {state.message ? (
        <p className={state.status === "success" ? "text-sm text-emerald-700" : "text-sm text-rose-600"}>
          {state.status === "outcome_unknown" ? `${state.message} 확인 전에는 편집할 수 없습니다. 아래 버튼은 최초 등록 요청을 다시 확인합니다.` : state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <RegisterCardSubmitButton pending={pending} complete={complete} retry={state.status === "outcome_unknown"} />
      </div>
    </form>
  );
}

function RegisterCardSubmitButton({ retry, pending, complete }: { retry: boolean; pending: boolean; complete: boolean }) {

  return (
    <button
      type="submit"
      disabled={pending || complete}
      className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {complete ? "저장됨 · 최신 자료 확인" : pending ? "등록 중" : retry ? "같은 요청 확인 / 재시도" : "내 카드로 등록"}
    </button>
  );
}
