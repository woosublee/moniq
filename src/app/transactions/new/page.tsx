import Link from "next/link";

import { TransactionCreateDialog } from "@/components/transactions/transaction-create-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { getDefaultUserCard, getRecentTransactions, getUserCards } from "@/lib/supabase/queries";
import type { PaymentMethod } from "@/features/transactions/types";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    paymentMethod?: PaymentMethod | "all";
    userCardId?: string;
  }>;
}) {
  const filters = await searchParams;
  const [transactions, userCards, defaultUserCard] = await Promise.all([
    getRecentTransactions(filters),
    getUserCards(),
    getDefaultUserCard(),
  ]);
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d4ed8_0%,_#0f172a_38%,_#020617_100%)] text-white">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2 text-sm font-medium">
                <Link href="/" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                  홈
                </Link>
                <Link href="/cards" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                  내 카드
                </Link>
                <Link href="/cards/search" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                  카드 검색
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-200/70">
                  Transactions
                </p>
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                  날짜와 조건으로 거래 내역을 보는 가계부 메인 화면입니다.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-blue-50/78 sm:text-base">
                  거래 추가는 모달에서 처리하고, 메인 화면에서는 내역 조회와 필터에 집중합니다.
                </p>
              </div>
            </div>

            <TransactionCreateDialog
              userCards={userCards}
              defaultUserCardId={defaultUserCard?.id ?? null}
            />
          </div>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 backdrop-blur sm:p-7">
          <form className="flex flex-wrap items-end gap-3">
            <label className="min-w-[160px] flex-1 text-sm text-blue-50/82">
              시작일
              <input
                type="date"
                name="startDate"
                defaultValue={filters.startDate ?? ""}
                className="mt-2 h-11 w-full rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white outline-none"
              />
            </label>
            <label className="min-w-[160px] flex-1 text-sm text-blue-50/82">
              종료일
              <input
                type="date"
                name="endDate"
                defaultValue={filters.endDate ?? ""}
                className="mt-2 h-11 w-full rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white outline-none"
              />
            </label>
            <label className="min-w-[160px] flex-1 text-sm text-blue-50/82">
              결제수단
              <select name="paymentMethod" defaultValue={filters.paymentMethod ?? "all"} className="mt-2 h-11 w-full rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white outline-none">
                <option value="all" className="text-slate-950">전체</option>
                <option value="cash" className="text-slate-950">현금</option>
                <option value="credit_card" className="text-slate-950">신용카드</option>
                <option value="check_card" className="text-slate-950">체크카드</option>
                <option value="points" className="text-slate-950">포인트</option>
              </select>
            </label>
            <label className="min-w-[200px] flex-[1.2] text-sm text-blue-50/82">
              카드
              <select name="userCardId" defaultValue={filters.userCardId ?? ""} className="mt-2 h-11 w-full rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white outline-none">
                <option value="" className="text-slate-950">전체 카드</option>
                {userCards.map((userCard) => (
                  <option key={userCard.id} value={userCard.id} className="text-slate-950">
                    {userCard.alias || `${userCard.card.issuer} ${userCard.card.name}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-blue-50"
              >
                필터 적용
              </button>
              <Link
                href="/transactions/new"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/6 px-5 text-sm font-medium text-blue-50 transition hover:bg-white/10"
              >
                초기화
              </Link>
            </div>
          </form>
        </section>

        <TransactionsTable transactions={transactions} userCards={userCards} />
      </div>
    </main>
  );
}
