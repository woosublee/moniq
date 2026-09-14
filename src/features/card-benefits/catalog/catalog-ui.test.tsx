import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerContext: vi.fn(async () => ({ ownerId: "synthetic-owner", mode: "authenticated" as const, canMutate: true, role: null })), assertCanMutate: vi.fn(), createAuthorizedSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/queries", () => ({ searchCards: vi.fn(), getUserCards: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import CardSearchPage from "@/app/cards/search/page";
import { UserCardsList } from "@/components/cards/user-cards-list";
import { CardPerformanceDetail } from "@/components/cards/card-performance-detail";
import { getUserCards, searchCards } from "@/lib/supabase/queries";
import { getOwnerContext } from "@/lib/auth/owner";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { card } from "../replay.fixtures";

describe("existing catalog surfaces", () => {
  it("shows source and non-execution disclosures in search without disabling ledger registration", async () => {
    const sample = { ...card().card, issuer: "KB국민", name: "탄탄대로 Miz&Mr 티타늄카드", benefit_support_status: "full" as const };
    vi.mocked(searchCards).mockResolvedValue([sample]);
    vi.mocked(getUserCards).mockResolvedValue([]);
    const html = renderToStaticMarkup(await CardSearchPage({ searchParams: Promise.resolve({ query: "Miz" }) }));
    expect(html).toContain("적용 기간 미검증");
    expect(html).toContain("A-20171206-9120-00436-08");
    expect(html).toContain("https://img2.kbcard.com/obj/card/download/09230__prdctOpmn_20240408.pdf");
    expect(html).toContain("미지원");
    expect(html).toContain("내 카드로 등록");
    expect(html).not.toContain("혜택 계산 지원");
  });
  it("keeps the selected month through catalog search while demo registration stays read-only", async () => {
    vi.mocked(getOwnerContext).mockResolvedValue({ ownerId: DEMO_OWNER_ID, mode: "demo", canMutate: false, role: null });
    vi.mocked(searchCards).mockResolvedValue([card().card]);
    vi.mocked(getUserCards).mockResolvedValue([]);
    const html = renderToStaticMarkup(await CardSearchPage({ searchParams: Promise.resolve({ query: "가상", month: "2026-02" }) }));
    expect(html).toContain('name="month" value="2026-02"');
    expect(html).toContain('/cards?month=2026-02');
    expect(html).toContain("읽기 전용");
    expect(html).not.toContain("내 카드로 등록");
  });
  it("keeps the same candidate gate in registered-card and detail displays", () => {
    const sample = card();
    sample.card = { ...sample.card, issuer: "KB국민", name: "탄탄대로 Biz 티타늄카드", benefit_support_status: "full" };
    for (const html of [renderToStaticMarkup(<UserCardsList cards={[sample]} />), renderToStaticMarkup(<CardPerformanceDetail userCard={sample} summary={null} transactions={[]} />)]) {
      expect(html).toContain("공식 설명서 확보");
      expect(html).toContain("적용 기간 미검증");
      expect(html).not.toContain("혜택 계산 지원");
    }
  });
});
