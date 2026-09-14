"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cardsHref, parseCardsQuery } from "@/features/cards/workspace-view";
import { ledgerQueryEndMonth, ledgerQueryHref, parseLedgerQuery } from "@/features/ledger/workspace-view";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";

export function SiteHeader() {
  const pathname = usePathname();
  const params = useSearchParams();
  const values = Object.fromEntries([...params.keys()].map(key => [key, params.getAll(key).length > 1 ? params.getAll(key) : params.get(key) ?? ""]));
  const detailId = /^\/cards\/([^/]+)$/.exec(pathname)?.[1];
  if (!Object.hasOwn(values, "card") && detailId && detailId !== "search") values.card = decodeURIComponent(detailId);
  const state = parseLedgerQuery(values, currentSeoulMonth());
  const ledger = ledgerQueryHref(state);
  const cardState = parseCardsQuery({ month: ledgerQueryEndMonth(state), card: state.card }, currentSeoulMonth());
  // Cross-section links use native history. The installed router's soft transition
  // can replace the filtered ledger entry during a route-tree retry; Back must retain it.
  const items = [
    { href: ledger, label: "가계부", active: pathname === "/ledger" || pathname === "/transactions/new" },
    { href: ledger.replace("/ledger", "/dashboard"), label: "통계", active: pathname === "/dashboard" },
    { href: cardsHref(cardState), label: "카드", active: pathname === "/cards" || pathname.startsWith("/cards/") },
  ];
  return <>
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="site-header"><div className="site-header-inner">
      <Link className="site-brand" href="/ledger">Moniq</Link>
      <nav className="site-desktop-nav" aria-label="주 메뉴">{items.map(item => <a key={item.label} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</a>)}</nav>
      <details className="site-more"><summary>메뉴</summary><nav aria-label="추가 메뉴"><Link href="/demo">데모 보기</Link><Link href="/auth/entry">로그인</Link></nav></details>
    </div></header>
    <nav className="site-bottom-nav" aria-label="모바일 주 메뉴">{items.map(item => <a key={item.label} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</a>)}</nav>
  </>;
}
