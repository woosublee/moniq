import { CardAddDialog } from "@/components/cards/card-add-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { UserCardsList } from "@/components/cards/user-cards-list";
import { getUserCards, searchCards } from "@/lib/supabase/queries";

export default async function CardsPage() {
  const [cards, cardCatalog] = await Promise.all([
    getUserCards(),
    searchCards(""),
  ]);
  const defaultCard = cards.find((card) => card.is_default);
  const creditCards = cards.filter((card) => card.card.card_type === "credit_card").length;
  const checkCards = cards.filter((card) => card.card.card_type === "check_card").length;

  return (
    <>
      <PageHeader
        eyebrow="내 카드"
        title="내 카드를 관리하세요."
        description="가계부 입력에 사용할 카드를 등록하고 기본 결제 카드를 정합니다."
        actions={<CardAddDialog cards={cardCatalog} userCards={cards} />}
      />

      <section className="border-b border-slate-200 pb-3 text-sm text-slate-600">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span>
            등록 <strong className="font-semibold text-slate-950">{cards.length}장</strong>
          </span>
          <span>
            기본 카드 <strong className="font-semibold text-slate-950">{defaultCard ? `${defaultCard.card.issuer} ${defaultCard.card.name}${defaultCard.alias ? ` (${defaultCard.alias})` : ""}` : "없음"}</strong>
          </span>
          <span>
            신용 <strong className="font-semibold text-slate-950">{creditCards}장</strong>
          </span>
          <span>
            체크 <strong className="font-semibold text-slate-950">{checkCards}장</strong>
          </span>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between text-sm">
          <p className="font-semibold text-slate-900">등록된 카드</p>
          <span className="text-slate-500">{cards.length}장</span>
        </div>
        <UserCardsList cards={cards} />
      </section>
    </>
  );
}
