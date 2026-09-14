import type { CardsSearchParams } from "@/features/cards/workspace-view";
import { renderLedgerPage } from "@/components/ledger/ledger-page";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<CardsSearchParams> }) {
  return renderLedgerPage(searchParams, "/dashboard");
}
