import { PageHeader } from "@/components/layout/page-header";
import { RegisterCardDialog } from "@/components/cards/register-card-dialog";
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
    <>
      <PageHeader
        eyebrow="카드 추가"
        title="사용 중인 카드를 찾아 등록하세요."
        description="카드사나 카드명으로 검색한 뒤 가계부 입력에 사용할 카드로 추가합니다."
      />

      <section className="border-b border-slate-200 pb-3">
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="text"
            name="query"
            defaultValue={query}
            placeholder="카드사 또는 카드명"
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

            return (
              <article key={card.id} className="py-4 hover:bg-slate-50/70">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-slate-950">
                        {card.issuer} {card.name}
                      </p>
                      {registered ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          추가됨
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
                      {card.network ? ` · ${card.network}` : ""}
                      {typeof card.annual_fee === "number" ? ` · 연회비 ${card.annual_fee.toLocaleString("ko-KR")}원` : ""}
                    </p>
                  </div>
                  {registered ? (
                    <span className="hidden text-sm font-medium text-emerald-700 lg:block">
                      추가됨
                    </span>
                  ) : (
                    <RegisterCardDialog card={card} />
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
