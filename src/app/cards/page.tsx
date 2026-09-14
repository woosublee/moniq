import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CardAddDialog } from "@/components/cards/card-add-dialog";
import { CardWorkspaceView } from "@/components/cards/card-workspace";
import { UserCardsList } from "@/components/cards/user-cards-list";
import { cardsHref, parseCardsQuery, type CardsSearchParams } from "@/features/cards/workspace-view";
import { getOwnerContext } from "@/lib/auth/owner";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { getCardWorkspace } from "@/lib/card-workspace/load";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";
import { demoWorkspaceMonth, getDemoCardWorkspace } from "@/lib/demo/card-workspace";

export default async function CardsPage({ searchParams }: { searchParams: Promise<CardsSearchParams> }) {
  await connection();
  const owner = await getOwnerContext();
  const synthetic = owner.ownerId === DEMO_OWNER_ID;
  const params = await searchParams;
  const state = parseCardsQuery(params, synthetic ? demoWorkspaceMonth : currentSeoulMonth());
  if (params.month !== state.month || params.tab !== state.tab) redirect(cardsHref(state, { page: state.page }));
  const workspace = synthetic ? getDemoCardWorkspace(state.month) : await getCardWorkspace(state.month);
  const cards = workspace.inputs.cards.filter(card => !card.archived_at);
  return <CardWorkspaceView workspace={workspace} state={state} canMutate={owner.canMutate} synthetic={synthetic}
    actions={owner.canMutate ? <CardAddDialog key={state.month} userCards={cards} month={state.month} /> : undefined}
    management={owner.canMutate ? <UserCardsList cards={cards} performanceSummaries={workspace.summaries} month={state.month} canMutate /> : undefined} />;
}
