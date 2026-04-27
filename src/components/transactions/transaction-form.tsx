"use client";

import { useActionState, useEffect } from "react";

import { SubmitButton } from "@/components/transactions/submit-button";
import { createTransaction } from "@/app/transactions/new/actions";
import type { UserCardRecord } from "@/features/cards/types";
import type { TransactionRecord } from "@/features/transactions/types";
import {
  initialTransactionFormState,
  paymentMethodOptions,
} from "@/features/transactions/constants";

const getLocalDatetimeValue = (date: Date = new Date()) => {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const fieldClassName =
  "mt-2 w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition placeholder:text-blue-100/40 focus:border-cyan-300/70 focus:bg-white/8";

const labelClassName = "text-sm font-medium text-blue-50/88";

const ledgerCategories = [
  "생활비",
  "식비",
  "교통비",
  "주거비",
  "통신비",
  "쇼핑",
  "구독",
  "기타",
];

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
    <section className={compact ? "" : "rounded-[28px] border border-white/10 bg-white/6 p-7 backdrop-blur"}>
      {compact ? null : (
        <div className="space-y-2">
          <p className="text-lg font-semibold text-white">거래 입력</p>
          <p className="text-sm leading-7 text-blue-100/72">
            가계부처럼 금액, 사용처, 결제수단, 카드를 빠르게 입력하고 바로 저장합니다.
          </p>
        </div>
      )}

      <form action={formAction} className={compact ? "space-y-5" : "mt-6 space-y-5"}>
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
            <span className={labelClassName}>거래 일시</span>
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
            <span className={labelClassName}>내 카드</span>
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
                  {userCard.alias || `${userCard.card.issuer} ${userCard.card.name}`}
                </option>
              ))}
            </select>
            {userCards.length > 0 ? (
              <p className="mt-2 text-xs text-blue-100/55">
                등록한 내 카드 중에서 선택합니다. 현금이나 포인트 결제는 비워둘 수 있습니다.
              </p>
            ) : (
              <p className="mt-2 text-xs text-cyan-200">
                등록된 카드가 없습니다. 먼저 카드 검색에서 내 카드를 등록해 주세요.
              </p>
            )}
            <FieldError errors={state.fieldErrors?.userCardId} />
          </label>

          <label className="block">
            <span className={labelClassName}>사용 내역 카테고리</span>
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
            <span className={labelClassName}>실 사용 금액</span>
            <input
              name="actualAmount"
              type="number"
              min="0"
              step="1"
              className={fieldClassName}
              defaultValue={initialTransaction ? Number(initialTransaction.actual_amount) : undefined}
              placeholder="예: 12000"
              required
            />
            <FieldError errors={state.fieldErrors?.actualAmount} />
          </label>

          <label className="block">
            <span className={labelClassName}>혜택 금액</span>
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
            <span className={labelClassName}>최종 금액</span>
            <input
              name="finalAmount"
              type="number"
              min="0"
              step="1"
              className={fieldClassName}
              defaultValue={initialTransaction ? Number(initialTransaction.final_amount) : undefined}
            />
            <FieldError errors={state.fieldErrors?.finalAmount} />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="block">
            <span className={labelClassName}>혜택 라벨</span>
            <input
              name="benefitLabel"
              type="text"
              className={fieldClassName}
              defaultValue={initialTransaction?.benefit_label ?? ""}
              placeholder="예: 스타벅스 20% 할인"
            />
            <FieldError errors={state.fieldErrors?.benefitLabel} />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-blue-50/82">
            <input
              name="isPerformanceEligible"
              type="checkbox"
              defaultChecked={initialTransaction?.is_performance_eligible ?? true}
              className="h-4 w-4 rounded border-white/20"
            />
            실적 인정
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-blue-50/82">
            <input
              name="isFixedCost"
              type="checkbox"
              defaultChecked={initialTransaction?.is_fixed_cost ?? false}
              className="h-4 w-4 rounded border-white/20"
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
                ? "rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
                : "rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
            }
          >
            {state.message}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-2">
          <p className="text-xs leading-6 text-blue-100/55">
            혜택 라벨과 금액은 현재 수동 입력이며, 이후 계산 탭과 연결할 예정입니다.
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

  return <p className="mt-2 text-xs text-rose-200">{errors[0]}</p>;
}
