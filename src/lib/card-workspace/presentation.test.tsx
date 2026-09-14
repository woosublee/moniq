import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerContext: vi.fn(), assertCanMutate: vi.fn(), createAuthorizedSupabaseServerClient: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionCalculationSummary } from "@/components/transactions/transaction-calculation-summary";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { annotation, inputs, policy, transaction, version } from "@/features/card-benefits/replay.fixtures";
import type { ReplayInputs, RewardUnit } from "@/features/card-benefits/engine-types";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { UserCardsList } from "@/components/cards/user-cards-list";
import { CardPerformanceDetail } from "@/components/cards/card-performance-detail";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "./view-model";
import { buildTransactionExplanation } from "@/features/card-benefits/explanations";
import { CardInsights } from "@/components/dashboard/card-insights";
import { parseLedgerQuery, selectLedgerActivity } from "@/features/ledger/workspace-view";

function rendered(source: ReplayInputs) {
  const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
  const table = renderToStaticMarkup(<TransactionsTable transactions={workspace.transactions} userCards={source.cards.slice()} canMutate={false} />);
  const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const desktop = table.slice(table.indexOf("<table"));
  const cells = [...desktop.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => text(match[1]));
  const detail = renderToStaticMarkup(<CardPerformanceDetail userCard={source.cards[0]} transactions={workspace.transactions} summary={workspace.summaries[0]} />);
  return { workspace, mobile: text(table.slice(0, table.indexOf("<table"))), desktopCells: cells,
    cards: text(renderToStaticMarkup(<UserCardsList cards={source.cards.slice()} performanceSummaries={workspace.summaries} />)),
    detailBenefit: text(detail.slice(detail.indexOf("이번 달 혜택"), detail.indexOf("</section>", detail.indexOf("이번 달 혜택")))),
    recent: text(detail.slice(detail.indexOf("최근 거래"))) };
}
function rewardInputs(rewards: { key: string; unit?: RewardUnit; amount: number }[], unknown = false) {
  const rules = policy({ performanceScopes: unknown ? policy().performanceScopes : [], benefits: rewards.map((reward, index) => ({
    ...policy().benefits[0], key: reward.key, benefitKind: reward.unit?.kind === "won" ? "discount" : "points", unit: reward.unit,
    reward: { kind: "fixed", amount: reward.amount }, performance: unknown ? policy().benefits[0].performance : { kind: "none" },
    combination: { kind: "stack", with: rewards.filter(other => other.key !== reward.key).map(other => other.key), priority: index },
  })) });
  return inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one", 1000)], monthInputs: [] });
}

describe("existing UI v2 value integration", () => {
  it.each(["원문-확인필요", "2026-02-30T01:00:00Z"])("Task17 fix1 opens invalid expense date %s without inventing a replacement", occurred_at => {
    const row = { ...transaction("invalid-date"), amount: "10.5", actual_amount: "10.5", occurred_at };
    const html = renderToStaticMarkup(<TransactionForm initialTransaction={row} defaultUserCardId={null} month="2026-02" />);
    expect(html).toContain("날짜 확인 필요"); expect(html).toContain(occurred_at);
    expect(html).toContain('name="originalLocalOccurredAt" value=""');
    const input = html.match(/<input[^>]*name="occurredAt"[^>]*>/)?.[0];
    expect(input).toContain('value=""'); expect(input).not.toContain("required");
    expect(html).toContain('name="originalAmount" value="10.5"');
  });
  it("Task17 fix1 keeps the valid Seoul minute display as the unchanged microsecond timestamp sentinel", () => {
    const row = { ...transaction("precise", 1000, "2026-02-18T01:22:33.123456Z"), amount: "10.5", actual_amount: "10.5" };
    const html = renderToStaticMarkup(<TransactionForm initialTransaction={row} defaultUserCardId={null} month="2026-02" />);
    expect(html).toContain('name="originalLocalOccurredAt" value="2026-02-18T10:22"');
    expect(html).toContain('name="originalAmount" value="10.5"');
  });
  it.each(["policy gap", "unallocated benefit"])("does not present %s as a complete card benefit total", (cause) => {
    const source = rewardInputs([{ key: "base", unit: { kind: "won" }, amount: 100 }]);
    if (cause === "policy gap") source.ruleVersions = [version("a", source.ruleVersions[0].policy_json as ReturnType<typeof policy>, { effective_from: "2026-02-15" })];
    else source.annotations = [annotation("one", "0.125", "benefit_eligible", { origin: "legacy_manual", review_status: "needs_review", target_key: null })];
    const result = rendered(source);
    expect(result.cards).toMatch(/혜택 (?:합계 )?확인 필요/);
    expect(result.detailBenefit).toContain("확인 필요");
    expect(result.mobile).toMatch(/혜택 (?:합계 )?확인 필요/);
    expect(result.desktopCells[6]).toContain("확인 필요");
  });
  it("uses the preserved actual principal in both payment viewports and card detail", () => {
    const source = rewardInputs([{ key: "base", unit: { kind: "won" }, amount: 100 }]);
    source.transactions = [{ ...source.transactions[0], origin: "legacy", amount: "2000", actual_amount: "1000" }];
    const result = rendered(source);
    expect(result.workspace.totals.actualAmount).toBe(1000);
    expect(result.mobile).toContain("결제금액 1,000원");
    expect(result.desktopCells[4]).toBe("1,000원");
    expect(result.recent).toContain("1,000원");
    expect(result.recent).not.toContain("2,000원");
    expect(result.workspace.transactions[0]).toMatchObject({ amount: "2000", actual_amount: "1000" });
  });
  it.each([
    { unit: { kind: "points", program: "synthetic-points" } as const, label: "500포인트" },
    { unit: { kind: "miles", program: "synthetic-miles" } as const, label: "500마일" },
  ])("shows $unit.kind and program without inventing a won total", ({ unit, label }) => {
    const result = rendered(rewardInputs([{ key: "base", unit, amount: 500 }]));
    for (const value of [result.cards, result.mobile, result.desktopCells[6], result.detailBenefit]) {
      expect(value).toContain(label);
      expect(value).toContain(unit.program);
      expect(value).toContain("자동");
      expect(value).not.toMatch(/혜택 0원|^0원$/);
    }
    expect(result.workspace.totals.finalAmount).toBe(1000);
  });
  it("keeps multiple programs and applied sources separate, including explicitly confirmed zero", () => {
    const source = rewardInputs([
      { key: "p1", unit: { kind: "points", program: "synthetic-one" }, amount: 500 },
      { key: "p2", unit: { kind: "points", program: "synthetic-two" }, amount: 200 },
      { key: "m", unit: { kind: "miles", program: "synthetic-miles" }, amount: 50 },
      { key: "cash", unit: { kind: "won" }, amount: 100 },
    ]);
    source.annotations = [annotation("one", 0, "confirmed_benefit", { target_key: "p1" }), annotation("one", 600, "benefit_eligible", { target_key: "p2" })];
    const result = rendered(source);
    for (const value of [result.cards, result.mobile, result.desktopCells[6], result.detailBenefit]) {
      expect(value).toContain("0포인트 (synthetic-one) (명시 확정)");
      expect(value).toContain("600포인트 (synthetic-two) (예상 보정)");
      expect(value).toContain("50마일 (synthetic-miles) (자동)");
      expect(value).toContain("100원 (자동)");
      expect(value).not.toContain("750원");
    }
    expect(result.workspace.totals.benefitAmount).toBe(100);
    expect(result.workspace.totals.finalAmount).toBe(900);
  });
  it.each([false, true])("distinguishes zero points from unknown points (unknown=%s)", (unknown) => {
    const result = rendered(rewardInputs([{ key: "base", unit: { kind: "points", program: "synthetic-points" }, amount: unknown ? 500 : 0 }], unknown));
    for (const value of [result.cards, result.desktopCells[6], result.detailBenefit]) {
      expect(value).toContain("synthetic-points");
      expect(value).toContain(unknown ? "확인 필요" : "0포인트");
      if (unknown) expect(value).not.toContain("0포인트");
    }
  });
  it("renders a known zero won reward as zero, not unknown", () => {
    const result = rendered(rewardInputs([{ key: "base", unit: { kind: "won" }, amount: 0 }]));
    expect(result.cards).toContain("혜택 0원 (자동)");
    expect(result.desktopCells[6]).toBe("0원 (자동)");
    expect(result.detailBenefit).not.toContain("확인 필요");
  });
  it("labels a known program as partial when another program is unknown", () => {
    const source = rewardInputs([
      { key: "p1", unit: { kind: "points", program: "synthetic-known" }, amount: 500 },
      { key: "p2", unit: { kind: "points", program: "synthetic-unknown" }, amount: 200 },
    ], true);
    source.annotations = [annotation("one", 500, "confirmed_benefit", { target_key: "p1" })];
    const result = rendered(source);
    for (const value of [result.cards, result.mobile, result.desktopCells[6], result.detailBenefit]) {
      expect(value).toContain("합계 확인 필요");
      expect(value).toContain("알려진 부분 500포인트 (synthetic-known) (명시 확정)");
      expect(value).toContain("확인 필요 (포인트 (synthetic-unknown))");
    }
    expect(result.workspace.summaries[0].benefitAmount).toBeNull();
  });
  it("keeps an explicit confirmed zero known even when automatic eligibility is unknown", () => {
    const source = rewardInputs([{ key: "base", unit: { kind: "points", program: "synthetic-points" }, amount: 500 }], true);
    source.annotations = [annotation("one", 0, "confirmed_benefit")];
    const result = rendered(source);
    expect(result.workspace.transactions[0].workspace?.projection.benefits[0].automaticAmount).toBeNull();
    expect(result.desktopCells[6]).toBe("0포인트 (synthetic-points) (명시 확정)");
    expect(result.detailBenefit).not.toContain("확인 필요");
    expect(result.cards).toContain("혜택 0포인트 (synthetic-points) (명시 확정)");
  });
  it("does not guess won or a program for a legacy unidentified reward unit", () => {
    const result = rendered(rewardInputs([{ key: "base", amount: 500 }]));
    expect(result.desktopCells[6]).toContain("확인 필요");
    expect(result.detailBenefit).toContain("확인 필요");
    expect(result.cards).not.toContain("혜택 0원");
  });
  it("does not show legacy benefit amounts or zero for missing policies", () => {
    const source = inputs({ ruleVersions: [], transactions: [transaction("one")] });
    const row = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02")).transactions[0];
    const html = renderToStaticMarkup(<TransactionCalculationSummary transaction={row} />);
    expect(html).not.toContain("99,999");
    expect(html).toContain("확인 필요");
    expect(html).not.toContain("실적 제외");
    const explanation = buildTransactionExplanation(row).join(" ");
    expect(explanation).not.toContain("99,999");
    expect(explanation).toContain("확인 필요");
    const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
    const insights = renderToStaticMarkup(<CardInsights summaries={workspace.summaries} />);
    expect(insights).toContain("확인 필요");
    expect(insights).not.toContain("혜택 기록 없음");
  });
  it("keeps invalid household principal and fixed costs unknown in statistics rather than substituting zero", () => {
    const source = inputs({ transactions: [{ ...transaction("invalid"), actual_amount: "10.5", is_fixed_cost: true, ledger_category: "주거" }] });
    const cardWorkspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
    const projection = selectLedgerActivity({ cardWorkspace, incomeSource: { status: "unsupported" } }, parseLedgerQuery({ month: "2026-02" }, "2026-02"));
    const html = renderToStaticMarkup(<DashboardSummary projection={projection} />);
    expect(html).toContain("<dt>승인 원금</dt><dd>확인 필요</dd>");
    expect(html).toContain("<dt>고정비</dt><dd>확인 필요</dd>");
    expect(html).toContain('<th scope="row">주거</th><td>확인 필요</td><td>확인 필요</td>');
  });
});
