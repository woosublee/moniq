import Link from "next/link";

import { TransactionCreateDialog } from "@/components/transactions/transaction-create-dialog";
import { LocalDate } from "@/components/transactions/local-date";
import type { TransactionRecord } from "@/features/transactions/types";
import {
  getCurrentMonthTransactions,
  getDefaultUserCard,
  getUserCards,
} from "@/lib/supabase/queries";

const moneyFormatter = new Intl.NumberFormat("ko-KR");

const toMoney = (value: number | string | null | undefined) => Number(value) || 0;

const getCategorySummaries = (transactions: TransactionRecord[]) => {
  const totals = new Map<string, { amount: number; count: number }>();

  transactions.forEach((transaction) => {
    const name = transaction.ledger_category || "미분류";
    const current = totals.get(name) ?? { amount: 0, count: 0 };

    totals.set(name, {
      amount: current.amount + toMoney(transaction.final_amount),
      count: current.count + 1,
    });
  });

  return Array.from(totals, ([name, value]) => ({ name, ...value })).sort(
    (a, b) => b.amount - a.amount,
  );
};

export default async function Home() {
  const [transactions, userCards, defaultUserCard] = await Promise.all([
    getCurrentMonthTransactions(),
    getUserCards(),
    getDefaultUserCard(),
  ]);

  const summary = transactions.reduce(
    (acc, transaction) => ({
      actualAmount: acc.actualAmount + toMoney(transaction.actual_amount),
      finalAmount: acc.finalAmount + toMoney(transaction.final_amount),
      benefitAmount: acc.benefitAmount + toMoney(transaction.benefit_amount),
      eligibleSpendAmount:
        acc.eligibleSpendAmount + toMoney(transaction.eligible_spend_amount),
      fixedCostAmount:
        acc.fixedCostAmount +
        (transaction.is_fixed_cost ? toMoney(transaction.final_amount) : 0),
      benefitCount:
        acc.benefitCount + (toMoney(transaction.benefit_amount) > 0 ? 1 : 0),
    }),
    {
      actualAmount: 0,
      finalAmount: 0,
      benefitAmount: 0,
      eligibleSpendAmount: 0,
      fixedCostAmount: 0,
      benefitCount: 0,
    },
  );
  const categories = getCategorySummaries(transactions);
  const maxCategoryAmount = Math.max(...categories.map((category) => category.amount), 1);
  const recentTransactions = transactions.slice(0, 6);
  const defaultCardName = defaultUserCard
    ? `${defaultUserCard.card.issuer} ${defaultUserCard.card.name}${defaultUserCard.alias ? ` (${defaultUserCard.alias})` : ""}`
    : "없음";
  const topCategory = categories[0]?.name ?? "아직 없음";

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                대시보드
              </p>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  이번 달 가계부
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  지출, 카테고리, 카드 혜택과 실적 금액을 월 단위로 정리합니다.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TransactionCreateDialog
                userCards={userCards}
                defaultUserCardId={defaultUserCard?.id ?? null}
              />
              <Link
                href="/transactions/new"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                가계부 보기
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="이번 달 지출" value={`${moneyFormatter.format(summary.finalAmount)}원`} caption="혜택 반영 후" strong />
            <MetricCard label="결제 금액" value={`${moneyFormatter.format(summary.actualAmount)}원`} caption="할인·적립 전" />
            <MetricCard label="카드 혜택" value={`${moneyFormatter.format(summary.benefitAmount)}원`} caption={`${summary.benefitCount}건 기록`} accent />
            <MetricCard label="실적 인정" value={`${moneyFormatter.format(summary.eligibleSpendAmount)}원`} caption="카드 실적 기준" />
          </div>
        </div>

        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <InsightCard label="가장 큰 카테고리" value={topCategory} caption={`${categories[0] ? moneyFormatter.format(categories[0].amount) : "0"}원`} />
          <InsightCard label="이번 달 고정비" value={`${moneyFormatter.format(summary.fixedCostAmount)}원`} caption="반복 지출로 표시된 금액" />
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-950">카테고리별 지출</p>
              <p className="mt-1 text-sm text-slate-500">이번 달 지출 분포</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              {transactions.length}건
            </span>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              아직 이번 달에 기록한 지출이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {categories.slice(0, 6).map((category) => (
                <div key={category.name}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-slate-800">{category.name}</span>
                    <span className="text-slate-500">
                      {moneyFormatter.format(category.amount)}원 · {category.count}건
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{
                        width: `${Math.max(
                          (category.amount / maxCategoryAmount) * 100,
                          4,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-950">카드/혜택 요약</p>
              <p className="mt-1 text-sm text-slate-500">결제 카드와 혜택 기록</p>
            </div>
            <Link
              href="/cards"
              className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              카드 관리
            </Link>
          </div>

          <div className="divide-y divide-slate-100 border-y border-slate-200 text-sm">
            <SummaryRow label="기본 결제 카드" value={defaultCardName} />
            <SummaryRow label="등록한 카드" value={`${userCards.length}장`} />
            <SummaryRow label="혜택 기록" value={`${summary.benefitCount}건`} />
            <SummaryRow label="아낀 금액" value={`${moneyFormatter.format(summary.benefitAmount)}원`} accent />
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">최근 거래</p>
            <p className="mt-1 text-sm text-slate-500">최근 기록한 지출</p>
          </div>
          <Link
            href="/transactions/new"
            className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            전체 보기
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            첫 지출을 기록하면 이곳에 최근 거래가 표시됩니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border-y border-slate-200">
            {recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">
                    {transaction.merchant_name}
                  </p>
                  <p className="mt-1 text-slate-500">
                    <LocalDate value={transaction.occurred_at} /> · {transaction.ledger_category || "미분류"}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  {toMoney(transaction.benefit_amount) > 0 ? (
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      혜택 {moneyFormatter.format(toMoney(transaction.benefit_amount))}원
                    </span>
                  ) : null}
                  <p className="text-right font-semibold text-slate-950">
                    {moneyFormatter.format(toMoney(transaction.final_amount))}원
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  caption,
  accent = false,
  strong = false,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
  strong?: boolean;
}) {
  return (
    <article className={accent ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4" : "rounded-xl border border-slate-200 bg-slate-50 p-4"}>
      <p className={accent ? "text-sm font-medium text-emerald-700" : "text-sm text-slate-500"}>{label}</p>
      <p className={accent ? "mt-2 text-2xl font-semibold text-emerald-900" : strong ? "mt-2 text-2xl font-semibold text-slate-950" : "mt-2 text-2xl font-semibold text-slate-900"}>{value}</p>
      <p className={accent ? "mt-1 text-sm text-emerald-700" : "mt-1 text-sm text-slate-500"}>{caption}</p>
    </article>
  );
}

function InsightCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{caption}</p>
    </article>
  );
}

function SummaryRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className={accent ? "font-semibold text-emerald-700" : "font-semibold text-slate-950"}>{value}</span>
    </div>
  );
}
