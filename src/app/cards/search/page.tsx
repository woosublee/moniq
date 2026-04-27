import Link from "next/link";

import { RegisterCardForm } from "@/components/cards/register-card-form";
import { getUserCards, searchCards } from "@/lib/supabase/queries";

export default async function CardSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const { query = "" } = await searchParams;
  const [cards, userCards] = await Promise.all([
    searchCards(query),
    getUserCards(),
  ]);
  const registeredCardIds = new Set(userCards.map((userCard) => userCard.card.id));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d4ed8_0%,_#0f172a_38%,_#020617_100%)] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:px-10 lg:px-12">
        <header className="rounded-[28px] border border-white/10 bg-white/6 p-8 backdrop-blur">
          <div className="flex flex-wrap gap-2 text-sm font-medium">
            <Link href="/" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
              홈
            </Link>
            <Link href="/transactions/new" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
              지출 내역
            </Link>
            <Link href="/cards" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
              내 카드
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-200/70">
              카드 찾기
            </p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              사용 중인 카드를 찾아 등록하세요.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-blue-50/78 sm:text-base">
              카드사나 카드명으로 검색한 뒤, 지출 기록에 사용할 카드를 내 카드로 추가할 수 있습니다.
            </p>
          </div>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-7 backdrop-blur">
          <form className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="카드사 또는 카드명으로 검색"
              className="h-12 flex-1 rounded-full border border-white/10 bg-white/6 px-5 text-sm text-white outline-none placeholder:text-blue-100/35"
            />
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-blue-50"
            >
              검색
            </button>
          </form>

          {cards.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/4 px-5 py-8 text-sm text-blue-100/70">
              <p className="text-base font-semibold text-white">
                {query ? "검색 결과가 없어요." : "카드사나 카드명을 입력해 보세요."}
              </p>
              <p className="mt-2 leading-7">
                {query
                  ? "카드명이나 카드사를 다른 표현으로 입력해 다시 찾아보세요."
                  : "보유한 카드를 찾은 뒤 내 카드로 추가하면 지출 기록에 바로 사용할 수 있습니다."}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {cards.map((card) => (
                <article
                key={card.id}
                className="rounded-[24px] border border-white/10 bg-white/5 p-5"
              >
                <p className="text-base font-semibold text-white">
                  {card.issuer} {card.name}
                </p>
                <p className="mt-2 text-sm text-blue-100/72">
                  {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
                  {card.network ? ` · ${card.network}` : ""}
                  {typeof card.annual_fee === "number" ? ` · 연회비 ${card.annual_fee.toLocaleString("ko-KR")}원` : ""}
                </p>
                <RegisterCardForm
                  card={card}
                  disabled={registeredCardIds.has(card.id)}
                />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
