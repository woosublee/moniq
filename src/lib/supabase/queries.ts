import "server-only";
import { cache } from "react";
import type { CardRecord, UserCardRecord } from "@/features/cards/types";
import type { CardPerformanceSummary } from "@/features/card-benefits/types";
import { compareLedgerChronology, getMonthBounds, parseMonth } from "@/features/card-benefits/periods";
import type { TransactionFilters, TransactionRecord } from "@/features/transactions/types";
import { getCardWorkspace } from "@/lib/card-workspace/load";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { getDemoCards, getDemoTransactions, getDemoUserCard, getDemoUserCards, getDemoBenefitApplications } from "@/lib/demo/fixtures";
import { demoWorkspaceMonth, getDemoHouseholdWorkspace } from "@/lib/demo/household-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const cardSelect = "id, issuer, name, card_type, network, annual_fee, image_url, benefit_support_status, benefit_summary, searchable_text, created_at";
const workspaceForOwner = cache(async (ownerId: string, month: string) => {
  const workspace = await getCardWorkspace(month);
  if (workspace.ownerId !== ownerId) throw new Error("이 데이터에 접근할 권한이 없습니다.");
  return workspace;
});
export const getCurrentMonthDateRange = (_timezoneOffset = "-540") => {
  void _timezoneOffset; // compatibility argument; ledger boundaries are always Asia/Seoul
  const month = currentSeoulMonth();
  const bounds = getMonthBounds(month);
  return { startDate: `${month}-01`, endDate: new Date(new Date(bounds.endExclusive).getTime() + 9 * 3600000 - 1).toISOString().slice(0, 10) };
};
function monthForFilters(filters: TransactionFilters) {
  const candidate = filters.endDate?.slice(0, 7) ?? currentSeoulMonth();
  const month = parseMonth(candidate);
  if (!month) throw new Error("조회 월을 확인해 주세요.");
  return month;
}
function filterRows(rows: readonly TransactionRecord[], filters: TransactionFilters) {
  return rows.filter((row) => {
    if (row.input_excluded) return false;
    const day = row.workspace?.projection.day;
    return (!filters.startDate || !!day && day >= filters.startDate)
      && (!filters.endDate || !!day && day <= filters.endDate)
      && (!filters.paymentMethod || filters.paymentMethod === "all" || row.payment_method === filters.paymentMethod)
      && (!filters.userCardId || row.user_card_id === filters.userCardId);
  }).sort((a, b) => compareLedgerChronology(b, a));
}
export const getRecentTransactions = cache(async (ownerId: string, filters: TransactionFilters = {}): Promise<TransactionRecord[]> => {
  if (ownerId === DEMO_OWNER_ID) return getDemoTransactions(filters).slice(0, 50);
  const workspace = await workspaceForOwner(ownerId, monthForFilters(filters));
  return filterRows(workspace.transactions, filters).slice(0, 50);
});
export const getCurrentMonthTransactions = cache(async (ownerId: string, _timezoneOffset = "-540"): Promise<TransactionRecord[]> => {
  void _timezoneOffset; // retained signature; use the canonical Seoul month
  if (ownerId === DEMO_OWNER_ID) return getDemoTransactions({ startDate: `${demoWorkspaceMonth}-01`, endDate: `${demoWorkspaceMonth}-28` });
  const range = getCurrentMonthDateRange();
  const workspace = await workspaceForOwner(ownerId, currentSeoulMonth());
  return filterRows(workspace.transactions, range);
});
export const searchCards = cache(async (query: string, ownerId?: string): Promise<CardRecord[]> => {
  if (ownerId === DEMO_OWNER_ID) return getDemoCards(query).slice(0, 20);
  const supabase = await createSupabaseServerClient();
  let request = supabase.from("cards").select(cardSelect).order("issuer", { ascending: true }).limit(20);
  if (query.trim()) request = request.ilike("searchable_text", `%${query.trim()}%`);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as CardRecord[];
});
export const getUserCards = cache(async (ownerId: string): Promise<UserCardRecord[]> => {
  if (ownerId === DEMO_OWNER_ID) return getDemoUserCards();
  return (await workspaceForOwner(ownerId, currentSeoulMonth())).inputs.cards.filter((card) => !card.archived_at);
});
export const getUserCard = cache(async (ownerId: string, userCardId: string): Promise<UserCardRecord | null> => {
  if (ownerId === DEMO_OWNER_ID) return getDemoUserCard(userCardId);
  return (await workspaceForOwner(ownerId, currentSeoulMonth())).inputs.cards.find((card) => card.id === userCardId) ?? null;
});
export const getTransactionsForUserCard = cache(async (ownerId: string, userCardId: string, filters: Pick<TransactionFilters, "startDate" | "endDate" | "timezoneOffset"> = {}): Promise<TransactionRecord[]> => {
  if (ownerId === DEMO_OWNER_ID) return getDemoTransactions({ ...filters, userCardId });
  return filterRows((await workspaceForOwner(ownerId, monthForFilters(filters))).transactions, { ...filters, userCardId });
});
export const getDefaultUserCard = cache(async (ownerId: string) => (await getUserCards(ownerId)).find((card) => card.is_default) ?? null);
/** Historical snapshots only; never used in workspace totals or new writes. */
export const getTransactionBenefitApplications = cache(async (ownerId: string, transactionIds: string[]) => {
  if (ownerId === DEMO_OWNER_ID) return getDemoBenefitApplications(transactionIds);
  const workspace = await workspaceForOwner(ownerId, currentSeoulMonth());
  return workspace.inputs.transactions.filter((row) => transactionIds.includes(row.id)).flatMap((row) => row.transaction_benefit_applications ?? []);
});
export const getCardPerformanceSummaries = cache(async (ownerId: string, _timezoneOffset = "-540"): Promise<CardPerformanceSummary[]> => {
  void _timezoneOffset; // retained signature; all summaries use the canonical Seoul month
  if (ownerId === DEMO_OWNER_ID) return getDemoHouseholdWorkspace(demoWorkspaceMonth).cardWorkspace.summaries;
  return (await workspaceForOwner(ownerId, currentSeoulMonth())).summaries.filter((summary) => !summary.userCard.archived_at);
});
