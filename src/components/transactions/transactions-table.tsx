"use client";

import { useMemo, useState, useTransition } from "react";

import { deleteTransactions } from "@/app/transactions/new/actions";
import { LocalDate } from "@/components/transactions/local-date";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import type { UserCardRecord } from "@/features/cards/types";
import type { PaymentMethod, TransactionRecord } from "@/features/transactions/types";

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "현금",
  credit_card: "신용카드",
  check_card: "체크카드",
  points: "포인트",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR");

const getPaymentDisplay = (transaction: TransactionRecord) => {
  const isCardPayment =
    transaction.payment_method === "credit_card" ||
    transaction.payment_method === "check_card";

  if (!isCardPayment) {
    return paymentMethodLabel[transaction.payment_method];
  }

  return transaction.user_cards
    ? `${transaction.user_cards.card.issuer} ${transaction.user_cards.card.name}`
    : paymentMethodLabel[transaction.payment_method];
};

const tableColumns =
  "grid-cols-[32px_82px_minmax(180px,1.5fr)_minmax(150px,1fr)_100px_100px_90px_minmax(140px,1fr)_72px_110px_64px]";

const rowContentColumns =
  "grid-cols-[82px_minmax(180px,1.5fr)_minmax(150px,1fr)_100px_100px_90px_minmax(140px,1fr)_72px_110px_64px]";

export function TransactionsTable({
  transactions,
  userCards,
}: {
  transactions: TransactionRecord[];
  userCards: UserCardRecord[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    transactions.length > 0 && selectedIds.length === transactions.length;

  const toggleTransaction = (transactionId: string) => {
    setMessage(null);
    setSelectedIds((current) =>
      current.includes(transactionId)
        ? current.filter((id) => id !== transactionId)
        : [...current, transactionId],
    );
  };

  const toggleAll = () => {
    setMessage(null);
    setSelectedIds(allSelected ? [] : transactions.map((transaction) => transaction.id));
  };

  const deleteSelected = () => {
    startTransition(async () => {
      const result = await deleteTransactions(selectedIds);

      if (result.status === "success") {
        setSelectedIds([]);
        setMessage(null);
        return;
      }

      setMessage(result.message);
    });
  };

  if (transactions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-sm text-slate-500 shadow-sm">
        <p className="text-base font-semibold text-slate-950">아직 기록한 지출이 없어요.</p>
        <p className="mt-2 leading-7">
          상단의 지출 추가 버튼으로 오늘 쓴 돈을 기록하면 날짜, 카드, 혜택 금액을 여기에서 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        <div className="min-h-9">
          {selectedIds.length > 0 ? (
            <BulkToolbar
              count={selectedIds.length}
              pending={isPending}
              message={message}
              onDelete={deleteSelected}
              onClear={() => setSelectedIds([])}
            />
          ) : null}
        </div>
        {transactions.map((transaction) => {
          const paymentDisplay = getPaymentDisplay(transaction);
          const benefitAmount = Number(transaction.benefit_amount);
          const selected = selectedIdSet.has(transaction.id);

          return (
            <article
              key={transaction.id}
              className={
                selected
                  ? "rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm"
                  : "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              }
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleTransaction(transaction.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-slate-950"
                  aria-label={`${transaction.merchant_name} 선택`}
                />
                <div className="min-w-0 flex-1">
                  <TransactionEditDialog
                    transaction={transaction}
                    userCards={userCards}
                    trigger={
                      <span className="block text-left">
                        <span className="flex items-start justify-between gap-4">
                          <span className="min-w-0">
                            <span className="block truncate text-lg font-semibold text-slate-950">
                              {transaction.merchant_name}
                            </span>
                            <span className="mt-1 block text-sm text-slate-500">
                              <LocalDate value={transaction.occurred_at} /> · {paymentMethodLabel[transaction.payment_method]}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-lg font-semibold text-slate-950">
                            {moneyFormatter.format(Number(transaction.final_amount))}원
                          </span>
                        </span>
                      </span>
                    }
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm text-slate-600">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">결제수단</span>
                  <span className="truncate text-right text-slate-700">{paymentDisplay}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">결제금액</span>
                  <span className="text-slate-700">
                    {moneyFormatter.format(Number(transaction.actual_amount))}원
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">혜택</span>
                  <span className="text-emerald-700">
                    {benefitAmount > 0
                      ? `${moneyFormatter.format(benefitAmount)}원`
                      : "-"}
                  </span>
                </div>
                {transaction.benefit_label ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">혜택 상세</span>
                    <span className="truncate text-right text-slate-700">
                      {transaction.benefit_label}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600">
                  {transaction.is_performance_eligible ? "실적 인정" : "실적 제외"}
                </span>
                {transaction.ledger_category ? (
                  <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600">
                    {transaction.ledger_category}
                  </span>
                ) : null}
                {transaction.is_fixed_cost ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                    고정비
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <div className="min-h-9">
          {selectedIds.length > 0 ? (
            <BulkToolbar
              count={selectedIds.length}
              pending={isPending}
              message={message}
              onDelete={deleteSelected}
              onClear={() => setSelectedIds([])}
            />
          ) : null}
        </div>
        <div className="min-w-[1180px] w-full">
          <div className={`grid ${tableColumns} gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500`}>
            <span className="flex justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-slate-300 accent-slate-950"
                aria-label="전체 선택"
              />
            </span>
            <span>날짜</span>
            <span>사용처</span>
            <span>결제수단</span>
            <span>결제금액</span>
            <span>최종지출</span>
            <span>혜택</span>
            <span>혜택 상세</span>
            <span>실적반영</span>
            <span>카테고리</span>
            <span>고정비</span>
          </div>

          {transactions.map((transaction) => {
            const selected = selectedIdSet.has(transaction.id);

            return (
              <div
                key={transaction.id}
                className={`grid ${tableColumns} gap-2 border-b border-slate-200/60 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 ${
                  selected ? "bg-emerald-50 hover:bg-emerald-50" : ""
                }`}
              >
                <span className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleTransaction(transaction.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-slate-950"
                    aria-label={`${transaction.merchant_name} 선택`}
                  />
                </span>
                <TransactionEditDialog
                  transaction={transaction}
                  userCards={userCards}
                  triggerClassName="col-span-10 block text-left"
                  trigger={
                    <span className={`grid ${rowContentColumns} gap-2`}>
                      <span className="text-center text-slate-500">
                        <LocalDate value={transaction.occurred_at} />
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block truncate font-medium text-slate-950">{transaction.merchant_name}</span>
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-slate-600">
                          {getPaymentDisplay(transaction)}
                        </span>
                      </span>
                      <span className="text-right font-medium tabular-nums text-slate-700">
                        {moneyFormatter.format(Number(transaction.actual_amount))}원
                      </span>
                      <span className="text-right font-semibold tabular-nums text-slate-950">
                        {moneyFormatter.format(Number(transaction.final_amount))}원
                      </span>
                      <span className="text-center tabular-nums text-emerald-700">
                        {Number(transaction.benefit_amount) > 0
                          ? `${moneyFormatter.format(Number(transaction.benefit_amount))}원`
                          : "-"}
                      </span>
                      <span className="min-w-0 text-center">
                        <span className="block truncate text-slate-600">{transaction.benefit_label || ""}</span>
                      </span>
                      <span className="text-center">{transaction.is_performance_eligible ? "인정" : "제외"}</span>
                      <span className="truncate text-center">{transaction.ledger_category || "-"}</span>
                      <span className="text-center">{transaction.is_fixed_cost ? "고정" : "-"}</span>
                    </span>
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function BulkToolbar({
  count,
  pending,
  message,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  message: string | null;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-8 flex-wrap items-center gap-2 border-b border-slate-200 pb-2 text-sm text-slate-600">
      <span className="font-medium text-slate-950">{count}개 선택됨</span>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-md px-2 py-1 font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
      >
        {pending ? "삭제 중" : "선택 삭제"}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        선택 해제
      </button>
      {message ? <span className="text-rose-600">{message}</span> : null}
    </div>
  );
}
