import Link from "next/link";

import { UserCardsList } from "@/components/cards/user-cards-list";
import { getUserCards } from "@/lib/supabase/queries";

export default async function CardsPage() {
  const cards = await getUserCards();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d4ed8_0%,_#0f172a_38%,_#020617_100%)] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:px-10 lg:px-12">
        <header className="rounded-[28px] border border-white/10 bg-white/6 p-8 backdrop-blur">
          <div className="mb-6 flex flex-wrap gap-2 text-sm font-medium">
            <Link href="/" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
              홈
            </Link>
            <Link href="/transactions/new" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
              지출 내역
            </Link>
            <Link href="/cards/search" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
              카드 찾기
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-200/70">
                My cards
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                자주 쓰는 카드를 등록해두세요.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50/78 sm:text-base">
                지출을 기록할 때 결제 카드를 빠르게 선택하고, 카드별 지출도 함께 확인할 수 있습니다.
              </p>
            </div>
            <Link
              href="/cards/search"
              className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              카드 찾기
            </Link>
          </div>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-7 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-white">등록된 카드</p>
              <p className="mt-2 text-sm leading-7 text-blue-100/72">
                가장 자주 쓰는 카드를 기본 카드로 설정하면 새 지출을 입력할 때 먼저 선택됩니다.
              </p>
            </div>
            <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-medium text-blue-50/82">
              {cards.length}장 등록됨
            </span>
          </div>

          <div className="mt-6">
            <UserCardsList cards={cards} />
          </div>
        </section>
      </div>
    </main>
  );
}
