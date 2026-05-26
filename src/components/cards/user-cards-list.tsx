import Link from "next/link";

import { deleteUserCard, setDefaultUserCard } from "@/app/cards/actions";
import type { UserCardRecord } from "@/features/cards/types";

export function UserCardsList({ cards }: { cards: UserCardRecord[] }) {
  if (cards.length === 0) {
    return (
      <div className="border-y border-slate-200 px-3 py-8 text-sm text-slate-500">
        <p className="font-semibold text-slate-950">아직 등록한 카드가 없어요.</p>
        <p className="mt-1">카드를 등록하면 지출 입력 시 결제 카드를 바로 선택할 수 있습니다.</p>
        <Link
          href="/cards"
          className="mt-4 inline-flex h-8 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          카드 추가
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-y border-slate-200 bg-white">
      <div className="grid min-w-[640px] grid-cols-[minmax(0,1fr)_130px_96px_132px] gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
        <span>카드</span>
        <span className="text-center">종류</span>
        <span className="text-center">상태</span>
        <span className="text-center">관리</span>
      </div>
      <div className="divide-y divide-slate-100">
        {cards.map((userCard) => (
          <article
            key={userCard.id}
            className="grid min-w-[640px] grid-cols-[minmax(0,1fr)_130px_96px_132px] items-center gap-3 px-3 py-3 text-sm hover:bg-slate-50/70"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-950">
                {userCard.card.issuer} {userCard.card.name}
              </p>
              <p className="mt-1 truncate text-slate-500">
                {userCard.alias ? `별칭: ${userCard.alias}` : "별칭 없음"}
              </p>
            </div>
            <span className="text-center text-slate-600">
              {userCard.card.card_type === "credit_card" ? "신용카드" : "체크카드"}
            </span>
            <span className="text-center">
              {userCard.is_default ? (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  기본
                </span>
              ) : (
                <span className="text-slate-400">-</span>
              )}
            </span>
            <div className="flex justify-end gap-1 pr-2">
              <form action={setDefaultUserCard.bind(null, userCard.id)}>
                <button
                  type="submit"
                  disabled={userCard.is_default}
                  className="inline-flex h-8 items-center justify-center rounded-md px-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  기본
                </button>
              </form>
              <form action={deleteUserCard.bind(null, userCard.id)}>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center justify-center rounded-md px-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  삭제
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
