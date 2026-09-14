import { connection } from "next/server";
import Link from "next/link";
import { cardsHref, parseCardsQuery, type CardsSearchParams } from "@/features/cards/workspace-view";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";

import { CardSupportBadge } from "@/components/cards/card-support-badge";
import { findPublicCardCandidate } from "@/features/card-benefits/catalog";
import { RegisterCardDialog } from "@/components/cards/register-card-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { getOwnerContext } from "@/lib/auth/owner";
import { getUserCards, searchCards } from "@/lib/supabase/queries";

export default async function CardSearchPage({
  searchParams,
}: {
  searchParams: Promise<CardsSearchParams>;
}) {
  await connection();

  const state = parseCardsQuery(await searchParams, currentSeoulMonth());
  const { query } = state;
  const owner = await getOwnerContext();
  const [cards, userCards] = await Promise.all([
    searchCards(query, owner.ownerId),
    getUserCards(owner.ownerId),
  ]);
  const registeredCardIds = new Set(userCards.map((userCard) => userCard.card.id));

  return (
    <>
      <PageHeader
        eyebrow="카드 추가"
        title="사용 중인 카드를 찾아 등록하세요."
        description="카드사나 카드명으로 검색한 뒤 가계부 입력에 사용할 카드로 추가합니다."
      />

      <section className="border-b border-slate-200 pb-3">
        <Link href={cardsHref(state, { query: "" })} className="inline-block py-3 text-sm underline">내 카드로 돌아가기</Link>
        {!owner.canMutate ? <p className="mb-3 text-sm text-slate-600">읽기 전용 · 데모에서는 카드를 등록하지 않습니다.</p> : null}
        <form action="/cards/search" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="month" value={state.month} />
          <input
            type="text"
            name="query"
            defaultValue={query}
            placeholder="카드사 또는 카드명"
            aria-label="카드사 또는 카드명"
            className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:bg-slate-100 focus:border-slate-300 focus:bg-white sm:w-72"
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            검색
          </button>
        </form>
      </section>

      {cards.length === 0 ? (
        <section className="border-b border-slate-200 py-8 text-sm text-slate-500">
          <p className="font-semibold text-slate-950">
            {query ? "검색 결과가 없어요." : "카드사나 카드명을 입력해 보세요."}
          </p>
          <p className="mt-1">
            {query
              ? "카드명이나 카드사를 다른 표현으로 입력해 다시 찾아보세요."
              : "보유한 카드를 찾은 뒤 내 카드로 추가하면 지출 기록에 바로 사용할 수 있습니다."}
          </p>
        </section>
      ) : (
        <section className="divide-y divide-slate-100 border-y border-slate-200 bg-white">
          {cards.map((card) => {
            const registered = registeredCardIds.has(card.id);
            const candidate = findPublicCardCandidate(card);

            return (
              <article key={card.id} className="py-4 hover:bg-slate-50/70">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-slate-950">
                        {card.issuer} {card.name}
                      </p>
                      <CardSupportBadge status={card.benefit_support_status} card={card} />
                      {registered ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          보유 중 · 다른 카드도 등록 가능
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
                      {card.network ? ` · ${card.network}` : ""}
                      {typeof card.annual_fee === "number" ? ` · 연회비 ${card.annual_fee.toLocaleString("ko-KR")}원` : ""}
                    </p>
                    {card.benefit_summary ? (
                      <p className="mt-1 text-sm text-slate-500">{card.benefit_summary}</p>
                    ) : null}
                    {candidate ? (
                      <details className="mt-2 text-xs leading-5 text-slate-600">
                        <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2">확인한 조건과 미지원 범위</summary>
                        <p className="mt-2 break-words">
                          <a href={candidate.source.url} target="_blank" rel="noreferrer" className="underline">공식 상품설명서 {candidate.source.documentId}</a>
                        </p>
                        <p>출처 대조 {candidate.source.checkedOn} · 이 날짜는 혜택 효력일이 아닙니다.</p>
                        <p>{candidate.effectivePeriod.reason}</p>
                        <p>지출 기록과 보정은 가능합니다. 아래는 확인된 조건의 일부 구현이며 실사용 자동 계산 완료를 뜻하지 않습니다.</p>
                        <ul className="mt-2 list-disc space-y-1 pl-4">{candidate.coverage.verifiedConditions.map(condition => <li key={condition}>{condition}</li>)}</ul>
                        <p className="mt-2 font-medium">미검증·미지원</p>
                        <ul className="list-disc space-y-1 pl-4">{candidate.coverage.unsupportedConditions.map(condition => <li key={condition}>{condition}</li>)}</ul>
                      </details>
                    ) : null}
                  </div>
                  {owner.canMutate ? (
                    <RegisterCardDialog key={`${card.id}:${state.month}`} card={card} month={state.month} />
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
