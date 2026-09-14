import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardsSearchParams } from "@/features/cards/workspace-view";
import { inputs, refund, transaction } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import type { IncomeSource, LedgerWorkspace } from "@/features/ledger/types";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
const nav = vi.hoisted(() => ({ pathname: "/ledger", query: "month=2026-01&startDate=2026-01-01&endDate=2026-03-02&card=a&kind=refund&page=2" }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, usePathname: () => nav.pathname, useSearchParams: () => new URLSearchParams(nav.query), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerContext: vi.fn(), assertCanMutate: vi.fn() }));
vi.mock("@/lib/card-workspace/load", () => ({ getLedgerWorkspace: vi.fn(), getCardWorkspace: vi.fn() }));
// These are old DB-only paths, kept as doubles so the pre-conversion route runs too.
vi.mock("@/lib/supabase/queries", () => ({ getRecentTransactions: async () => [], getCurrentMonthTransactions: async () => [], getUserCards: async () => [], getDefaultUserCard: async () => null, getCardPerformanceSummaries: async () => [], getCurrentMonthDateRange: () => ({ startDate: "2026-02-01", endDate: "2026-02-28" }) }));
import { getOwnerContext } from "@/lib/auth/owner";
import { getLedgerWorkspace, getCardWorkspace } from "@/lib/card-workspace/load";
import { SiteHeader } from "@/components/layout/site-header";
import LegacyPage from "@/app/transactions/new/page";
import DashboardPage from "@/app/dashboard/page";
const source = inputs({ transactions: [
  { ...transaction("old", 9000, "2026-01-05T01:00:00Z"), ledger_category: "식비", is_fixed_cost: true },
  ...Array.from({ length: 51 }, (_, i) => ({ ...transaction(`row-${i}`, 1000, "2026-02-02T01:00:00Z", "a", i + 2), merchant_name: "가상 생활비", ledger_category: "식비", is_fixed_cost: true, final_amount: 1 })),
  { ...transaction("cash", 4000, "2026-03-02T01:00:00Z", "", 55), payment_method: "cash" as const, user_card_id: null, ledger_category: "교통" },
], adjustments: [refund("old", 3000, "2026-02-02T02:00:00Z")] });
const incomeSource: IncomeSource = { status: "supported", entries: [{ id: "row-0", owner_id: source.ownerId, version: "7", stable_sequence: "99", occurred_at: "2026-02-02T03:00:00Z", source_name: "가상 급여", amount: 300000, ledger_category: "급여", memo: null, input_excluded: false, created_at: "2026-02-02T03:00:00Z", updated_at: "2026-02-02T03:00:00Z" }] };
const workspace: LedgerWorkspace = { cardWorkspace: buildCardWorkspace(source, "10", "2026-03", replayLedger(source, "2026-03")), incomeSource };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: source.ownerId, mode: "authenticated", canMutate: true, role: null });
  vi.mocked(getLedgerWorkspace).mockResolvedValue(workspace);
  vi.mocked(getCardWorkspace).mockResolvedValue(workspace.cardWorkspace);
});
function region(html: string, label: string) {
  return html.match(new RegExp(`<section[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/section>`))?.[1] ?? "";
}
async function renderLedger(params: CardsSearchParams) {
  const { default: LedgerPage } = await import("./page");
  return renderToStaticMarkup(await LedgerPage({ searchParams: Promise.resolve(params) }));
}
describe("Task17 navigation and source-backed household pages", () => {
  it("preserves all legacy query values on an internal redirect rather than reading the old ledger", async () => {
    await expect(LegacyPage({ searchParams: Promise.resolve({ startDate: "2026-01-01", endDate: "2026-03-02", userCardId: "a/b", query: ["first", "second"], card: "", timezoneOffset: "-540" }) })).rejects.toThrow("REDIRECT:/ledger?startDate=2026-01-01&endDate=2026-03-02&userCardId=a%2Fb&query=first&query=second&card=&timezoneOffset=-540");
  });
  it("uses only ledger, statistics and cards menus and retains range precedence and selected card", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('class="site-brand" href="/ledger"');
    const menu = html.match(/aria-label="주 메뉴">([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect(menu.match(/<a /g)).toHaveLength(3);
    expect(menu).toContain("가계부"); expect(menu).toContain("통계"); expect(menu).toContain("카드");
    expect(menu).toContain('/dashboard?startDate=2026-01-01&amp;endDate=2026-03-02&amp;card=a&amp;kind=refund&amp;page=2');
    expect(menu).toContain('/cards?month=2026-03&amp;tab=performance&amp;card=a');
    expect(menu).not.toContain("#quick-entry");
  });
  it("uses the range end snapshot and identical original-principal totals in both pages", async () => {
    const params = { month: "2026-01", startDate: "2026-01-01", endDate: "2026-03-02", page: "2" };
    const ledger = await renderLedger(params);
    const stats = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve(params) }));
    for (const html of [ledger, stats]) {
      const summary = region(html, "기간 전체 합계");
      expect(summary).toContain("300,000원"); expect(summary).toContain("61,000원"); expect(summary).toContain("239,000원");
    }
    expect(getLedgerWorkspace).toHaveBeenNthCalledWith(1, "2026-03"); expect(getLedgerWorkspace).toHaveBeenNthCalledWith(2, "2026-03");
    expect(stats).toContain("57,000원"); // 9000 + 51000 - 3000 fixed costs, never finalAmount.
    expect(ledger.match(/data-entry-key=/g)).toHaveLength(5);
    expect(ledger).toContain("55건");
  });
  it("keeps monthly totals separate from the full filtered and daily totals beyond 50 rows", async () => {
    const html = await renderLedger({ month: "2026-02", query: "생활비", page: "2" });
    expect(region(html, "월 전체 합계")).toContain("48,000원");
    expect(region(html, "검색·필터 결과 합계")).toContain("51,000원");
    expect(html).toContain("하루 지출 51,000원");
    expect(html.match(/data-entry-key=/g)).toHaveLength(1);
    expect(html).toContain('name="query"'); expect(html).toContain('value="생활비"');
    expect(html.match(/>내역 추가<\/button>/g)).toHaveLength(1);
    expect(html).not.toContain('name="merchantName"'); // no duplicate always-open form
  });
  it("never renders card calculations on income rows, even with colliding expense IDs", async () => {
    const html = await renderLedger({ month: "2026-02", kind: "income" });
    expect(html).toContain('data-entry-key="income:row-0"'); expect(html).toContain("+300,000원");
    expect(html).not.toContain("예상 혜택"); expect(html).not.toContain("실적 인정");
  });
  it("keeps old private snapshots unsupported while the shared demo has explicit income and remains read-only", async () => {
    vi.mocked(getLedgerWorkspace).mockResolvedValue({ ...workspace, incomeSource: { status: "unsupported" } });
    const html = await renderLedger({ month: "2026-02" });
    expect(region(html, "월 전체 합계")).toContain("확인 필요"); expect(html).toContain("수입 기능 적용 필요"); expect(html).toContain("가상 생활비");
    vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: DEMO_OWNER_ID, mode: "demo", canMutate: false, role: null });
    vi.mocked(getLedgerWorkspace).mockClear();
    const demo = await renderLedger({ month: "2026-02" });
    const summary = region(demo, "월 전체 합계");
    expect(summary).toContain("3,500,000원"); expect(summary).toContain("491,000원"); expect(summary).toContain("3,009,000원");
    expect(demo).toContain("읽기 전용"); expect(demo).toContain("한빛마트"); expect(demo).not.toContain("수입 기능 적용 필요");
    expect(getLedgerWorkspace).not.toHaveBeenCalled(); expect(demo).not.toContain(source.ownerId);
  });
});
