import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CardPerformanceDetail } from "@/components/cards/card-performance-detail";
import { PageHeader } from "@/components/layout/page-header";
import { cardsHref, parseCardsQuery, type CardsSearchParams } from "@/features/cards/workspace-view";
import { getOwnerContext } from "@/lib/auth/owner";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { getCardWorkspace } from "@/lib/card-workspace/load";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";
import { demoWorkspaceMonth, getDemoCardWorkspace } from "@/lib/demo/card-workspace";
import { getUserCard, getTransactionsForUserCard, getCardPerformanceSummaries } from "@/lib/supabase/queries";

export default async function CardDetailPage({ params, searchParams }: { params: Promise<{ userCardId: string }>; searchParams: Promise<CardsSearchParams> }) {
  await connection();
  const { userCardId } = await params;
  const owner = await getOwnerContext();
  const synthetic = owner.ownerId === DEMO_OWNER_ID;
  const state = parseCardsQuery(await searchParams, synthetic ? demoWorkspaceMonth : currentSeoulMonth());
  const workspace = synthetic ? getDemoCardWorkspace(state.month) : await getCardWorkspace(state.month);
  const userCard = workspace.inputs.cards.find(card => card.id === userCardId) ?? null;
  let transactions = workspace.transactions.filter(row => !row.input_excluded && row.user_card_id === userCardId && row.workspace?.projection.month === state.month);
  const summary = workspace.summaries.find(summary => summary.userCard.id === userCardId) ?? null;
  // Preserve links from the older isolated demo/dashboard, not private-owner fallbacks.
  if (!userCard && synthetic) {
    const legacyCard = await getUserCard(DEMO_OWNER_ID, userCardId);
    if (legacyCard) {
      const legacySummary = (await getCardPerformanceSummaries(DEMO_OWNER_ID)).find(row => row.userCard.id === userCardId) ?? null;
      return <><Link href={cardsHref(state)}>내 카드로 돌아가기</Link><CardPerformanceDetail userCard={legacyCard} transactions={await getTransactionsForUserCard(DEMO_OWNER_ID, userCardId)} summary={legacySummary} /></>;
    }
  }
  if (!userCard) notFound();
  // These values remain server-side; only the existing display components receive projections.
  transactions = [...transactions].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return <>
    <Link className="workspace-text-link" href={cardsHref(state, { page: state.page })}>내 카드로 돌아가기</Link>
    <PageHeader eyebrow="카드 상세" title={userCard.card.name} description={`${state.month} 입력 내역 기준 · 승인 원금과 단위별 혜택을 확인합니다.`} />
    {synthetic ? <p className="workspace-note">가상 데이터 · 실제 상품 약관·자동 계산 검증 결과가 아닙니다.</p> : null}
    <CardPerformanceDetail userCard={userCard} transactions={transactions} summary={summary} workspace={workspace} state={state} canMutate={owner.canMutate} synthetic={synthetic} />
  </>;
}
