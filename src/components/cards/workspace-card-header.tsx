import Link from "next/link";
import Image from "next/image";
import type { UserCardRecord } from "@/features/cards/types";
import { cardDetailHref, type CardsQuery } from "@/features/cards/workspace-view";

export function WorkspaceCardHeader({ card, state, status }: { card: UserCardRecord; state: CardsQuery; status?: string }) {
  return <header className="workspace-card-header">
    {card.card.image_url ? <Image className="workspace-card-image" src={card.card.image_url} width={30} height={44} unoptimized alt="" /> : <span className="workspace-card-placeholder" aria-hidden="true"><span /></span>}
    <div>
      <h2><Link href={cardDetailHref(card.id, state)}>{card.card.name}</Link></h2>
      <p className="workspace-card-meta">{card.alias || card.card.issuer}{card.last_four ? ` · 끝자리 ${card.last_four}` : ""}</p>
      {status ? <span className="workspace-status">{status}</span> : null}
    </div>
  </header>;
}
