import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { TimezoneOffsetInput } from "@/components/transactions/timezone-offset-input";
import { TransactionCreateDialog } from "@/components/transactions/transaction-create-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import type { PaymentMethod } from "@/features/transactions/types";
import {
  getCurrentMonthDateRange,
  getDefaultUserCard,
  getRecentTransactions,
  getUserCards,
} from "@/lib/supabase/queries";

const controlClassName =
  "h-8 rounded-md border border-transparent bg-transparent px-2 text-sm text-slate-700 outline-none transition hover:bg-slate-100 focus:border-slate-300 focus:bg-white";

const selectClassName = `${controlClassName} w-full appearance-none pr-6`;

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    paymentMethod?: PaymentMethod | "all";
    userCardId?: string;
    timezoneOffset?: string;
  }>;
}) {
  const searchFilters = await searchParams;
  const currentMonthFilters = getCurrentMonthDateRange(searchFilters.timezoneOffset);
  const filters = {
    ...searchFilters,
    startDate: searchFilters.startDate ?? currentMonthFilters.startDate,
    endDate: searchFilters.endDate ?? currentMonthFilters.endDate,
  };
  const [transactions, userCards, defaultUserCard] = await Promise.all([
    getRecentTransactions(filters),
    getUserCards(),
    getDefaultUserCard(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="가계부"
        title="월별 지출 내역을 확인하세요."
        description="기간, 결제수단, 카드 기준으로 지출 흐름을 정리하고 빠진 내역을 바로 기록할 수 있습니다."
      />

      <section className="border-b border-slate-200 pb-2">
        <form className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <TimezoneOffsetInput value={filters.timezoneOffset} syncCurrentMonth />
          <span className="mr-1 font-medium text-slate-600">필터</span>
          <label className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100">
            <span>시작</span>
            <input
              type="date"
              name="startDate"
              defaultValue={filters.startDate}
              className={`${controlClassName} w-[132px]`}
            />
          </label>
          <label className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100">
            <span>종료</span>
            <input
              type="date"
              name="endDate"
              defaultValue={filters.endDate}
              className={`${controlClassName} w-[132px]`}
            />
          </label>
          <label className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100">
            <span>결제</span>
            <span className="relative block w-[118px]">
              <select name="paymentMethod" defaultValue={filters.paymentMethod ?? "all"} className={selectClassName}>
                <option value="all" className="text-slate-950">전체</option>
                <option value="cash" className="text-slate-950">현금</option>
                <option value="credit_card" className="text-slate-950">신용카드</option>
                <option value="check_card" className="text-slate-950">체크카드</option>
                <option value="points" className="text-slate-950">포인트</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">⌄</span>
            </span>
          </label>
          <label className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100">
            <span>카드</span>
            <span className="relative block w-[220px]">
              <select name="userCardId" defaultValue={filters.userCardId ?? ""} className={selectClassName}>
                <option value="" className="text-slate-950">전체 카드</option>
                {userCards.map((userCard) => (
                  <option key={userCard.id} value={userCard.id} className="text-slate-950">
                    {userCard.card.issuer} {userCard.card.name}{userCard.alias ? ` (${userCard.alias})` : ""}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">⌄</span>
            </span>
          </label>
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            적용
          </button>
          <Link
            href="/transactions/new"
            className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            초기화
          </Link>
        </form>
      </section>

      <TransactionsTable transactions={transactions} userCards={userCards} />
      <TransactionCreateDialog
        userCards={userCards}
        defaultUserCardId={defaultUserCard?.id ?? null}
        variant="floating"
      />
    </>
  );
}
