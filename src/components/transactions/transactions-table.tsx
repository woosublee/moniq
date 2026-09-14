"use client";

import { useLedgerSelection } from "./use-ledger-selection";

import { currentSeoulMonth, formatWon, getTransactionAmounts, getTransactionBenefitLabel } from "@/lib/card-workspace/view-model";

import { LocalDate } from "@/components/transactions/local-date";
import { TransactionCalculationSummary } from "@/components/transactions/transaction-calculation-summary";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import type { UserCardRecord } from "@/features/cards/types";
import type { PaymentMethod, TransactionRecord } from "@/features/transactions/types";
import type { TransactionEditorContext } from "@/lib/card-workspace/input-options";

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "현금",
  credit_card: "신용카드",
  check_card: "체크카드",
  points: "포인트",
};



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



export function TransactionsTable({
  transactions,
  userCards,
  canMutate = true,
  month = currentSeoulMonth(),
  editorContexts,
}: {
  transactions: TransactionRecord[];
  userCards: UserCardRecord[];
  canMutate?: boolean;
  month?: string;
  editorContexts?: Record<string, TransactionEditorContext>;
}) {
  const { selectedIds, selectedIdSet, message, uncertainDelete, isPending, allSelected, toggleTransaction, toggleAll, clearSelection, deleteSelected } = useLedgerSelection(
    transactions.map(row => ({ key: row.id, ref: { id: row.id, version: String(row.version ?? "") } })), month,
  );

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
      {message ? <p role="status" className="text-sm text-amber-800">{message}</p> : null}
      <div className="grid gap-3 md:hidden">
        <div className="min-h-9">
          {selectedIds.length > 0 && canMutate ? (
            <BulkToolbar
              count={selectedIds.length}
              pending={isPending}
              retry={uncertainDelete}
              message={message}
              onDelete={deleteSelected}
              onClear={clearSelection}
            />
          ) : selectedIds.length > 0 ? (
            <ReadOnlyToolbar onClear={clearSelection} />
          ) : null}
        </div>
        {transactions.map((transaction) => {
          const paymentDisplay = getPaymentDisplay(transaction);
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
                    disabled={uncertainDelete || isPending}
                    readOnly={!canMutate}
                    context={editorContexts?.[transaction.id]}
                    month={month}
                    trigger={
                      <span className="block text-left">
                        <span className="flex items-start justify-between gap-4">
                          <span className="min-w-0">
                            <span className="block truncate text-lg font-semibold text-slate-950">
                              {transaction.merchant_name}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                              <span>
                                <LocalDate value={transaction.occurred_at} /> · {paymentMethodLabel[transaction.payment_method]}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-lg font-semibold text-slate-950">
                            {formatWon(getTransactionAmounts(transaction).finalAmount)}
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
                    {formatWon(getTransactionAmounts(transaction).actualAmount)}
                  </span>
                </div>
                <TransactionCalculationSummary transaction={transaction} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600">
                  {getTransactionAmounts(transaction).eligibleSpendAmount === null ? "실적 확인 필요" : getTransactionAmounts(transaction).eligibleSpendAmount === 0 ? "실적 미반영" : "실적 인정"}
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
          {selectedIds.length > 0 && canMutate ? (
            <BulkToolbar
              count={selectedIds.length}
              pending={isPending}
              retry={uncertainDelete}
              message={message}
              onDelete={deleteSelected}
              onClear={clearSelection}
            />
          ) : selectedIds.length > 0 ? (
            <ReadOnlyToolbar onClear={clearSelection} />
          ) : null}
        </div>
        <table className="min-w-[1180px] w-full border-collapse text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 accent-slate-950"
                  aria-label="전체 선택"
                />
              </th>
              <th className="w-24 px-3 py-2 text-left">날짜</th>
              <th className="min-w-48 px-3 py-2 text-left">사용처</th>
              <th className="min-w-44 px-3 py-2 text-left">결제수단</th>
              <th className="w-28 px-3 py-2 text-right">결제금액</th>
              <th className="w-28 px-3 py-2 text-right">최종지출</th>
              <th className="w-28 px-3 py-2 text-right">혜택</th>
              <th className="w-28 px-3 py-2 text-right">실적반영</th>
              <th className="w-32 px-3 py-2 text-left">카테고리</th>
              <th className="w-20 px-3 py-2 text-center">고정비</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {transactions.map((transaction) => {
              const selected = selectedIdSet.has(transaction.id);
              const { benefitAmount, eligibleSpendAmount } = getTransactionAmounts(transaction);

              return (
                <tr
                  key={transaction.id}
                  className={selected ? "bg-emerald-50" : "transition-colors hover:bg-slate-50"}
                >
                  <td className="px-3 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleTransaction(transaction.id)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-950"
                      aria-label={`${transaction.merchant_name} 선택`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle text-slate-500">
                    <TransactionEditDialog
                      transaction={transaction}
                      userCards={userCards}
                      disabled={uncertainDelete || isPending}
                    readOnly={!canMutate}
                    context={editorContexts?.[transaction.id]}
                    month={month}
                      triggerClassName="block w-full text-left"
                      trigger={<LocalDate value={transaction.occurred_at} />}
                    />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <TransactionEditDialog
                      transaction={transaction}
                      userCards={userCards}
                      disabled={uncertainDelete || isPending}
                    readOnly={!canMutate}
                    context={editorContexts?.[transaction.id]}
                    month={month}
                      triggerClassName="block w-full text-left"
                      trigger={
                        <span className="block min-w-0">
                          <span className="block truncate font-medium text-slate-950">
                            {transaction.merchant_name}
                          </span>
                          {transaction.merchant_normalized_name ? (
                            <span className="mt-1 block truncate text-xs text-slate-400">
                              {transaction.merchant_normalized_name}
                            </span>
                          ) : null}
                        </span>
                      }
                    />
                  </td>
                  <td className="px-3 py-3 align-middle text-slate-600">
                    <TransactionEditDialog
                      transaction={transaction}
                      userCards={userCards}
                      disabled={uncertainDelete || isPending}
                    readOnly={!canMutate}
                    context={editorContexts?.[transaction.id]}
                    month={month}
                      triggerClassName="block w-full text-left"
                      trigger={<span className="block truncate">{getPaymentDisplay(transaction)}</span>}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums text-slate-700">
                    {formatWon(getTransactionAmounts(transaction).actualAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right align-middle font-semibold tabular-nums text-slate-950">
                    {formatWon(getTransactionAmounts(transaction).finalAmount)}
                  </td>
                  <td className="min-w-48 max-w-xs break-words px-3 py-3 text-right align-middle tabular-nums">
                    <span className={benefitAmount !== null && benefitAmount > 0 ? "font-medium text-emerald-700" : "text-slate-500"}>
                      {getTransactionBenefitLabel(transaction)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums text-slate-700">
                    {formatWon(eligibleSpendAmount)}
                  </td>
                  <td className="px-3 py-3 align-middle text-slate-600">
                    <span className="block truncate">{transaction.ledger_category || "-"}</span>
                  </td>
                  <td className="px-3 py-3 text-center align-middle text-slate-600">
                    {transaction.is_fixed_cost ? "고정" : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReadOnlyToolbar({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-8 flex-wrap items-center gap-2 border-b border-slate-200 pb-2 text-sm text-amber-800">
      <span>데모 모드에서는 샘플 데이터를 변경할 수 없습니다.</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        선택 해제
      </button>
    </div>
  );
}

function BulkToolbar({
  count,
  pending,
  retry,
  message,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  retry: boolean;
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
        {pending ? "제외 중" : retry ? "같은 제외 요청 확인 / 재시도" : "오입력 제외"}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={pending || retry}
        className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        선택 해제
      </button>
      {message ? <span className="text-rose-600">{message}</span> : null}
    </div>
  );
}
