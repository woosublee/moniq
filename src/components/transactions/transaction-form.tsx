"use client";

import { useActionState, useEffect } from "react";

import { SubmitButton } from "@/components/transactions/submit-button";
import { TimezoneOffsetInput } from "@/components/transactions/timezone-offset-input";
import { createTransaction } from "@/app/transactions/new/actions";
import type { UserCardRecord } from "@/features/cards/types";
import type {
  TransactionFormState,
  TransactionRecord,
} from "@/features/transactions/types";
import {
  initialTransactionFormState,
  ledgerCategories,
  paymentMethodOptions,
} from "@/features/transactions/constants";

const getLocalDatetimeValue = (date: Date = new Date()) => {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const fieldClassName =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white";

const labelClassName = "text-sm font-medium text-slate-700";

export function TransactionForm({
  userCards = [],
  defaultUserCardId,
  compact = false,
  initialTransaction,
  onSuccess,
  action,
}: {
  userCards?: UserCardRecord[];
  defaultUserCardId: string | null;
  compact?: boolean;
  initialTransaction?: TransactionRecord | null;
  onSuccess?: () => void;
  action?: (prevState: TransactionFormState, formData: FormData) => Promise<TransactionFormState>;
}) {
  const [state, formAction] = useActionState(
    action ?? createTransaction,
    initialTransactionFormState,
  );

  const defaultOccurredAt = initialTransaction?.occurred_at
    ? getLocalDatetimeValue(new Date(initialTransaction.occurred_at))
    : getLocalDatetimeValue();

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.();
    }
  }, [onSuccess, state.status]);

  return (
    <section className={compact ? "" : "rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"}>
      {compact ? null : (
        <div className="space-y-2">
          <p className="text-lg font-semibold text-slate-950">지출 입력</p>
          <p className="text-sm leading-7 text-slate-500">
            금액, 사용처, 결제수단을 입력하고 필요한 경우 카드 혜택도 함께 기록하세요.
          </p>
        </div>
      )}

      <form action={formAction} className={compact ? "space-y-5" : "mt-6 space-y-5"}>
        <TimezoneOffsetInput />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>금액</span>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              className={fieldClassName}
              defaultValue={initialTransaction ? Number(initialTransaction.amount) : undefined}
              placeholder="예: 12000"
              required
            />
            <FieldError errors={state.fieldErrors?.amount} />
          </label>

          <label className="block">
            <span className={labelClassName}>사용처</span>
            <input
              name="merchantName"
              type="text"
              className={fieldClassName}
              defaultValue={initialTransaction?.merchant_name ?? ""}
              placeholder="예: 스타벅스 강남R"
              required
            />
            <FieldError errors={state.fieldErrors?.merchantName} />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>사용 일시</span>
            <input
              name="occurredAt"
              type="datetime-local"
              className={fieldClassName}
              defaultValue={defaultOccurredAt}
              required
            />
            <FieldError errors={state.fieldErrors?.occurredAt} />
          </label>

          <label className="block">
            <span className={labelClassName}>결제수단</span>
            <select
              name="paymentMethod"
              className={fieldClassName}
              defaultValue={initialTransaction?.payment_method ?? "credit_card"}
            >
              {paymentMethodOptions.map((option) => (
                <option key={option.value} value={option.value} className="text-slate-950">
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError errors={state.fieldErrors?.paymentMethod} />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <label className="block">
            <span className={labelClassName}>결제 카드</span>
            <select
              name="userCardId"
              className={fieldClassName}
              defaultValue={initialTransaction?.user_card_id ?? defaultUserCardId ?? ""}
            >
              <option value="" className="text-slate-950">
                카드 미선택
              </option>
              {userCards.map((userCard) => (
                <option key={userCard.id} value={userCard.id} className="text-slate-950">
                  {userCard.card.issuer} {userCard.card.name}{userCard.alias ? ` (${userCard.alias})` : ""}
                </option>
              ))}
            </select>
            {userCards.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                카드를 선택하면 지출 내역에서 카드별 사용 내역을 함께 확인할 수 있습니다.
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">
                카드를 등록하면 지출에 결제 카드를 연결할 수 있어요.
              </p>
            )}
            <FieldError errors={state.fieldErrors?.userCardId} />
          </label>

          <label className="block">
            <span className={labelClassName}>카테고리</span>
            <select
              name="ledgerCategory"
              className={fieldClassName}
              defaultValue={initialTransaction?.ledger_category ?? ""}
            >
              <option value="" className="text-slate-950">선택 안 함</option>
              {ledgerCategories.map((category) => (
                <option key={category} value={category} className="text-slate-950">
                  {category}
                </option>
              ))}
            </select>
            <FieldError errors={state.fieldErrors?.ledgerCategory} />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <span className={labelClassName}>결제 금액</span>
            <input
              name="actualAmount"
              type="number"
              min="0"
              step="1"
              className={fieldClassName}
              defaultValue={initialTransaction ? Number(initialTransaction.actual_amount) : undefined}
              placeholder="비워두면 금액과 같게 저장됩니다"
            />
            <FieldError errors={state.fieldErrors?.actualAmount} />
          </label>

          <label className="block">
            <span className={labelClassName}>할인/적립 금액</span>
            <input
              name="benefitAmount"
              type="number"
              min="0"
              step="1"
              className={fieldClassName}
              defaultValue={initialTransaction ? Number(initialTransaction.benefit_amount) : 0}
            />
            <FieldError errors={state.fieldErrors?.benefitAmount} />
          </label>

          <label className="block">
            <span className={labelClassName}>최종 지출</span>
            <input
              name="finalAmount"
              type="number"
              min="0"
              step="1"
              className={fieldClassName}
              defaultValue={initialTransaction ? Number(initialTransaction.final_amount) : undefined}
              placeholder="비워두면 결제 금액에서 혜택 금액을 뺀 값으로 저장됩니다"
            />
            <FieldError errors={state.fieldErrors?.finalAmount} />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="block">
            <span className={labelClassName}>혜택 메모</span>
            <input
              name="benefitLabel"
              type="text"
              className={fieldClassName}
              defaultValue={initialTransaction?.benefit_label ?? ""}
              placeholder="예: 스타벅스 20% 할인"
            />
            <FieldError errors={state.fieldErrors?.benefitLabel} />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            <input
              name="isPerformanceEligible"
              type="checkbox"
              defaultChecked={initialTransaction?.is_performance_eligible ?? true}
              className="h-4 w-4 rounded border-slate-300"
            />
            실적 인정
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            <input
              name="isFixedCost"
              type="checkbox"
              defaultChecked={initialTransaction?.is_fixed_cost ?? false}
              className="h-4 w-4 rounded border-slate-300"
            />
            고정비
          </label>
        </div>

        <label className="block">
          <span className={labelClassName}>메모</span>
          <input
            name="memo"
            type="text"
            className={fieldClassName}
            defaultValue={initialTransaction?.memo ?? ""}
            placeholder="선택 입력"
          />
          <FieldError errors={state.fieldErrors?.memo} />
        </label>

        {state.message ? (
          <div
            className={
              state.status === "success"
                ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                : "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            }
          >
            {state.message}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2">
          <p className="text-xs leading-6 text-slate-500">
            카드사 앱이나 영수증에서 확인한 할인·적립 혜택을 함께 적어두면 월말 정산이 쉬워져요.
          </p>
          <SubmitButton />
        </div>
      </form>
    </section>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-2 text-xs text-rose-600">{errors[0]}</p>;
}
