import Link from "next/link";
import { deleteUserCard, setDefaultUserCard } from "@/app/cards/actions";
import { CardSupportBadge } from "@/components/cards/card-support-badge";
import { LedgerMutationForm } from "@/components/transactions/ledger-request-fields";
import { formatWon, getCardBenefitLabel } from "@/lib/card-workspace/view-model";
import type { CardPerformanceSummary } from "@/features/card-benefits/types";
import type { UserCardRecord } from "@/features/cards/types";

export function UserCardsList({ cards, performanceSummaries = [], month, canMutate = false }: { cards: UserCardRecord[]; performanceSummaries?: CardPerformanceSummary[]; month?: string; canMutate?: boolean }) {
  if (!cards.length) return <div className="workspace-empty"><p>아직 등록한 카드가 없어요.</p><Link href="/cards/search">카드 찾기</Link></div>;
  const summaries = new Map(performanceSummaries.map(summary => [summary.userCard.id, summary]));
  return <div className="managed-cards">{cards.map(card => {
    const summary = summaries.get(card.id);
    return <article className="managed-card" key={card.id}>
      <h3>{card.card.issuer} {card.card.name}</h3>
      <p>{card.alias || "별칭 없음"} · {card.card.card_type === "credit_card" ? "신용카드" : "체크카드"}{card.is_default ? " · 기본 카드" : ""}</p>
      <CardSupportBadge status={card.card.benefit_support_status} card={card.card} />
      <p>실적 {formatWon(summary?.eligibleSpendAmount)} · 혜택 {getCardBenefitLabel(summary)}</p>
      {summary?.manualTotalMismatches?.length ? <p>수동 월 총액과 원장이 다릅니다. 상세에서 다시 확인해 주세요.</p> : null}
      <div className="managed-card-actions"><Link href={`/cards/${card.id}${month ? `?month=${month}` : ""}`}>상세 보기</Link>
        {canMutate ? <><LedgerMutationForm key={`default:${card.version}:${month}`} action={setDefaultUserCard.bind(null, card.id)} version={card.version} month={month}><button type="submit" disabled={card.is_default}>기본으로</button></LedgerMutationForm>
          <LedgerMutationForm key={`archive:${card.version}:${month}`} action={deleteUserCard.bind(null, card.id)} version={card.version} month={month}><button type="submit">보관</button></LedgerMutationForm></> : null}
      </div>
    </article>;
  })}</div>;
}
