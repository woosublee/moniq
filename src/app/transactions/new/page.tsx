import { redirect } from "next/navigation";
import type { CardsSearchParams } from "@/features/cards/workspace-view";

/** Compatibility route only. Browser fragments are consumed by the destination dialog. */
export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<CardsSearchParams> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  redirect(`/ledger${params.size ? `?${params}` : ""}`);
}
