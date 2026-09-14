import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerContext: vi.fn(), assertCanMutate: vi.fn() }));
vi.mock("@/lib/card-workspace/load", () => ({ getCardWorkspace: vi.fn() }));
vi.mock("@/lib/supabase/queries", () => ({ searchCards: vi.fn(), getUserCards: vi.fn(), getCardPerformanceSummaries: vi.fn(), getCurrentMonthTransactions: vi.fn(), getDefaultUserCard: vi.fn() }));
vi.mock("@/components/cards/card-add-dialog", () => ({ CardAddDialog: () => null }));
vi.mock("@/app/cards/actions", () => ({ deleteUserCard: vi.fn(), setDefaultUserCard: vi.fn() }));
vi.mock("@/components/transactions/transaction-create-dialog", () => ({ TransactionCreateDialog: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import CardsPage from "./page";
import CardSearchPage from "./search/page";
import Home from "@/app/page";
import { getOwnerContext } from "@/lib/auth/owner";
import { getCardWorkspace } from "@/lib/card-workspace/load";
import { searchCards, getUserCards, getCardPerformanceSummaries, getCurrentMonthTransactions, getDefaultUserCard } from "@/lib/supabase/queries";
import { inputs, transaction } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";

const source = inputs({ transactions: [{ ...transaction("one", 350000), amount: 999999 }] });
const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: source.ownerId, mode: "authenticated", canMutate: false, role: null });
  vi.mocked(getCardWorkspace).mockResolvedValue(workspace);
  vi.mocked(getUserCards).mockResolvedValue([...source.cards]);
  vi.mocked(getCardPerformanceSummaries).mockResolvedValue(workspace.summaries);
  vi.mocked(getCurrentMonthTransactions).mockResolvedValue(workspace.transactions);
  vi.mocked(getDefaultUserCard).mockResolvedValue(null);
});
describe("final fix 6: catalog ownership is not instance uniqueness", () => {
  it.each([true, false])("offers another instance of an owned product only with write permission (%s)", async canMutate => {
    vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: source.ownerId, mode: "authenticated", canMutate, role: null });
    vi.mocked(searchCards).mockResolvedValue([source.cards[0].card]);
    const html = renderToStaticMarkup(await CardSearchPage({ searchParams: Promise.resolve({ month: "2026-02" }) }));
    const buttons = html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.some(button => button.includes("내 카드로 등록"))).toBe(canMutate);
    expect(html).toContain('name="month" value="2026-02"');
  });
});

describe("server card workspace entry", () => {
  it("renders the approved transactions URL without redirecting to performance", async () => {
    const html = renderToStaticMarkup(await CardsPage({ searchParams: Promise.resolve({ month: "2026-02", tab: "transactions" }) }));
    expect(html).toContain('aria-label="월 사용내역"');
    expect(html).toContain("월 전체 승인 원금");
    expect(html).toContain("tab=transactions");
  });
  it("normalizes the old activity alias without losing month, filters or page", async () => {
    await expect(CardsPage({ searchParams: Promise.resolve({ month: "2026-02", tab: "activity", query: "cafe", card: "a", page: "2" }) })).rejects.toThrow("REDIRECT:/cards?month=2026-02&tab=transactions&query=cafe&card=a&page=2");
  });
  it("canonicalizes an absent demo month so shell links use the same selected month", async () => {
    vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: DEMO_OWNER_ID, mode: "demo", canMutate: false, role: null });
    await expect(CardsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/cards?month=2026-02&tab=performance");
    expect(getCardWorkspace).not.toHaveBeenCalled();
  });
  it("renders the selected month and three real navigation tabs from one authorized snapshot", async () => {
    const html = renderToStaticMarkup(await CardsPage({ searchParams: Promise.resolve({ month: "2026-02", tab: "performance" }) }));
    expect(html).toContain("실적 관리");
    expect(html).toContain("혜택 관리");
    expect(html).toContain("사용내역");
    expect(html).toContain("2026년 2월");
    expect(html).toContain("350,000원");
    expect(html).not.toContain("999,999원");
    expect(getCardWorkspace).toHaveBeenCalledWith("2026-02");
    expect(getUserCards).not.toHaveBeenCalled();
  });
  it("never loads a private snapshot when the established demo cookie owner is selected", async () => {
    vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: DEMO_OWNER_ID, mode: "demo", canMutate: false, role: null });
    const html = renderToStaticMarkup(await CardsPage({ searchParams: Promise.resolve({ month: "2026-02", tab: "benefits" }) }));
    expect(html).toContain("가상");
    expect(html).toContain("실제 상품");
    expect(getCardWorkspace).not.toHaveBeenCalled();
    expect(html).not.toContain(source.ownerId);
  });
  it("sends the authenticated root to the general ledger rather than a card-only home", async () => {
    await expect(Home()).rejects.toThrow("REDIRECT:/ledger");
  });
});
