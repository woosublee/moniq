import Link from "next/link";

import { deleteUserCard, setDefaultUserCard } from "@/app/cards/actions";
import type { UserCardRecord } from "@/features/cards/types";

export function UserCardsList({ cards }: { cards: UserCardRecord[] }) {
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/12 bg-white/4 px-5 py-8 text-sm text-blue-100/70">
        <p className="text-base font-semibold text-white">아직 등록한 카드가 없어요.</p>
        <p className="mt-2 leading-7">
          카드를 등록하면 지출을 입력할 때 결제 카드를 바로 선택할 수 있습니다.
        </p>
        <Link
          href="/cards/search"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          카드 찾으러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((userCard) => (
        <article
          key={userCard.id}
          className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-white">
                  {userCard.alias || userCard.card.name}
                </p>
                {userCard.is_default ? (
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-200">
                    기본 결제 카드
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-blue-100/72">
                {userCard.card.issuer} · {userCard.card.card_type === "credit_card" ? "신용카드" : "체크카드"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <form action={setDefaultUserCard.bind(null, userCard.id)}>
                <button
                  type="submit"
                  disabled={userCard.is_default}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/6 px-4 text-sm font-medium text-blue-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  기본으로 사용
                </button>
              </form>
              <form action={deleteUserCard.bind(null, userCard.id)}>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-rose-400/20 bg-rose-400/10 px-4 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20"
                >
                  삭제
                </button>
              </form>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
