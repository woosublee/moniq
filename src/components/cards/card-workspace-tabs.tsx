import Link from "next/link";
import { cardsHref, workspaceTabs, type CardsQuery } from "@/features/cards/workspace-view";

export function CardWorkspaceTabs({ state }: { state: CardsQuery }) {
  return <nav className="workspace-tabs" aria-label="내 카드 보기">
    {(Object.entries(workspaceTabs) as [CardsQuery["tab"], string][]).map(([tab, label]) =>
      <Link key={tab} href={cardsHref(state, { tab })} aria-current={state.tab === tab ? "page" : undefined} scroll={false}>{label}</Link>)}
  </nav>;
}
