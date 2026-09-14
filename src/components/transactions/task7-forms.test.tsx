import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, replace() {} }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
import { QuickTransactionForm } from "./quick-transaction-form";
import { TransactionForm } from "./transaction-form";
import { TransactionCalculationSummary } from "./transaction-calculation-summary";
import { RegisterCardForm } from "@/components/cards/register-card-form";
import { CardTargetForm } from "@/components/cards/card-target-form";
import { CardPerformanceDetail } from "@/components/cards/card-performance-detail";
import { annotation, inputs, monthData, policy, transaction, version } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { parseCardsQuery } from "@/features/cards/workspace-view";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
function fixture() {
  const source = inputs({ transactions: [{ ...transaction("one"), origin: "legacy", amount: "12000.125", actual_amount: "10000" }], annotations: [annotation("one", 0), annotation("one", 700, "confirmed_benefit"), annotation("one", "0.125", "benefit_eligible", { id: "lost", target_key: "removed", review_status: "needs_review", origin: "legacy_manual" })], ruleVersions: [version("a", policy({ performanceScopes: [], benefits: [{ ...policy().benefits[0], performance: { kind: "none" } }] }))] });
  return buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
}
describe("final fix: quota input in card detail", () => {
  it("renders an independent exact opening quota form, preserving decimal source and version", () => {
    const rules = policy(); rules.benefits[0].performance = { kind: "none" }; rules.benefits[0].quotaKeys = ["pool"];
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }];
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one")], monthInputs: [{ ...monthData("2026-02", "quota", "pool", { status: "remaining", amount: "0.125" }), version: "7" }] });
    const w = buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
    const html = renderToStaticMarkup(<CardPerformanceDetail userCard={w.inputs.cards[0]} transactions={w.transactions} summary={w.summaries[0]} workspace={w} state={parseCardsQuery({}, "2026-02")} canMutate />);
    const quotaForm = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find(form => /name="scopeKind"[^>]*value="quota"/.test(form));
    expect(quotaForm).toBeDefined();
    expect(quotaForm).toMatch(/name="scopeInstanceKey"[^>]*value="card:a:quota:pool"/);
    expect(quotaForm).toMatch(/name="version"[^>]*value="7"/);
    expect(quotaForm).toMatch(/name="amount"[^>]*value="0.125"/);
    expect(text(html)).toContain("기록된 거래를 계산하기 전");
    expect(text(html)).toContain("현재 잔여");
  });
});

describe("daily quota completion forms", () => {
  it.each(["complete", "unknown", "remaining"] as const)("renders one monthly source form for daily pools and preserves original %s", status => {
    const rules = policy({ performanceScopes: [], quotas: [{ key: "daily", period: "daily", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["daily"] }] });
    const original = { ...monthData("2026-02", "quota", "daily", { status, ...(status === "remaining" ? { amount: "0.125" } : {}) }), version: "7" };
    const source = inputs({ ruleVersions: [version("a", rules)], transactions: [transaction("one"), transaction("two", 10000, "2026-02-03T01:00:00Z")], monthInputs: [original] });
    const w = buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
    const html = renderToStaticMarkup(<CardPerformanceDetail userCard={w.inputs.cards[0]} transactions={w.transactions} summary={w.summaries[0]} workspace={w} state={parseCardsQuery({}, "2026-02")} canMutate />);
    const forms = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).filter(form => /name="scopeKind"[^>]*value="quota"/.test(form));
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatch(/name="scopeInstanceKey"[^>]*value="card:a:quota:daily"/);
    expect(forms[0]).toMatch(/name="inputMonth"[^>]*value="2026-02"/);
    expect(forms[0]).toMatch(/name="version"[^>]*value="7"/);
    expect(forms[0]).not.toContain('name="amount"');
    expect(forms[0]).not.toContain('value="remaining"');
    expect(text(html)).toContain("월 자료 원본 하나");
    expect(text(html)).toContain("각 날짜에 적용된 한도");
    expect(text(html)).toContain("2026-02-02"); expect(text(html)).toContain("2026-02-03");
    if (status === "remaining") {
      expect(text(html)).toContain("0.125"); expect(text(html)).toContain("일별 시작 잔여량은 미지원");
      expect(forms[0]).toMatch(/<select[^>]*required/);
      expect(forms[0]).toMatch(/<option[^>]*value=""[^>]*selected/);
    } else expect(forms[0]).toMatch(new RegExp(`<option[^>]*value="${status}"[^>]*selected`));
    expect(source.monthInputs).toEqual([original]);
  });
});

describe("Task16 income edit fields", () => {
  const income = { id: "10000000-0000-4000-8000-000000000016", owner_id: "synthetic-owner", version: "9007199254740993", stable_sequence: "1", occurred_at: "2026-02-24T15:30:22.123456Z", source_name: "Synthetic salary", amount: "123.456", ledger_category: "급여", memo: "original", input_excluded: false, created_at: "2026-02-25T00:00:00Z", updated_at: "2026-02-25T00:00:00Z" };
  it("edits income originals without exposing kind conversion, card facts, refund or annotations", () => {
    const html = renderToStaticMarkup(<TransactionForm initialIncome={income} defaultUserCardId={null} month="2026-02" />);
    expect(html).toMatch(/name="sourceName"[^>]*value="Synthetic salary"/);
    expect(html).toMatch(/name="version"[^>]*value="9007199254740993"/);
    expect(html).toMatch(/name="originalAmount"[^>]*value="123.456"/);
    expect(html).toMatch(/name="originalLocalOccurredAt"[^>]*value="2026-02-25"/);
    for (const name of ["entryKind", "entryId", "merchantName", "userCardId", "paymentMethod", "isFixedCost", "installmentMonths", "targetKind"]) expect(html).not.toContain(`name="${name}"`);
    expect(text(html)).not.toContain("혜택"); expect(text(html)).not.toContain("환불");
  });
  it.each(["invalid-original", "2026-02-30T00:00:00Z", "2026-02-25T10:00"])("leaves invalid original date %s visible for review rather than normalizing it", occurred_at => {
    const html = renderToStaticMarkup(<TransactionForm initialIncome={{ ...income, occurred_at }} defaultUserCardId={null} month="2026-02" />);
    expect(text(html)).toContain("날짜 확인 필요"); expect(text(html)).toContain(occurred_at);
    expect(html).toMatch(/name="originalLocalOccurredAt"[^>]*value=""/);
  });
});

describe("Task7 rendered input and detail contracts", () => {
  it("keeps the selected month when adding a card from a historical workspace", () => {
    const html = renderToStaticMarkup(<RegisterCardForm card={fixture().inputs.cards[0].card} month="2026-02" />);
    expect(html).toMatch(/name="month"[^>]*value="2026-02"/);
  });
  it("lets a stale target be replaced but requires an explicit selection", () => {
    const w = fixture();
    const html = renderToStaticMarkup(<CardTargetForm card={{ ...w.inputs.cards[0], target_scope_key: "old", target_tier_key: "gone" }} targets={[{ scopeKey: "spend", tierKey: "base", minimumSpend: 300000 }]} month="2026-02" />);
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).toMatch(/<select[^>]*required/);
    expect(html).toMatch(/<option[^>]*value=""[^>]*selected/);
  });
  it("retains cash, categories and fixed-cost creation outside the four primary fields", () => {
    const w = fixture();
    const html = renderToStaticMarkup(<QuickTransactionForm userCards={w.inputs.cards.slice()} defaultUserCardId="a" month="2026-02" />);
    expect(html).toContain('<option value="cash">현금</option>');
    const auxiliary = html.slice(html.indexOf("<details"));
    for (const name of ["ledgerCategory", "isFixedCost", "memo"]) expect(auxiliary).toContain(`name="${name}"`);
  });
  it("keeps four basic inputs with unknown auxiliary facts and selected month", () => {
    const w = fixture();
    const html = renderToStaticMarkup(<QuickTransactionForm userCards={w.inputs.cards.slice()} defaultUserCardId="a" month="2026-02" />);
    expect(html).toMatch(/name="month"[^>]*value="2026-02"/);
    const auxiliary = html.slice(html.indexOf("<details"));
    expect(auxiliary).toContain('name="paymentChannel"'); expect(auxiliary).toContain('name="installmentMonths"');
    expect(text(html)).toContain("시각을 모르면");
    expect(html).toMatch(/name="occurredAt"[^>]*type="date"|type="date"[^>]*name="occurredAt"/);
  });
  it("shows automatic, estimated zero and confirmed separately with lost correction source", () => {
    const w = fixture(); const html = renderToStaticMarkup(<TransactionCalculationSummary transaction={w.transactions[0]} />); const content = text(html);
    expect(content).toContain("자동 예상 500원"); expect(content).toContain("예상 고정 0원"); expect(content).toContain("실제 확정 700원");
    expect(content).toContain("removed"); expect(content).toContain("0.125"); expect(content).toContain("재확인 필요");
  });
  it("edits the preserved legacy source while displaying actual principal and no fake won reward field", () => {
    const w = fixture(); const html = renderToStaticMarkup(<TransactionForm initialTransaction={w.transactions[0]} defaultUserCardId="a" month="2026-03" />);
    expect(html).toMatch(/name="originalAmount"[^>]*value="12000.125"/);
    expect(html).toMatch(/name="month"[^>]*value="2026-03"/);
    expect(html).toContain('name="paymentChannel"'); expect(html).toContain('name="installmentMonths"');
    expect(html).not.toContain('name="benefitAmount"');
    expect(text(html)).toContain("10,000원");
  });
  it.each([false, true])("offers the prior input of a newly executable version, preserving its original record (existing: %s)", existing => {
    const original = { ...monthData("2026-01", "performance", "spend", { status: "manual_total", amount: "300000" }), version: "7" };
    const source = inputs({ ruleVersions: [version("a", policy(), { effective_from: "2026-02-01" })], transactions: [transaction("one")], monthInputs: existing ? [original] : [] });
    const w = buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
    const html = renderToStaticMarkup(<CardPerformanceDetail userCard={w.inputs.cards[0]} transactions={w.transactions} summary={w.summaries[0]} workspace={w} state={parseCardsQuery({}, "2026-02")} canMutate />);
    const priorForm = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find(form => /name="inputMonth"[^>]*value="2026-01"/.test(form));
    expect(priorForm).toBeDefined();
    expect(priorForm).toMatch(/name="month"[^>]*value="2026-02"/);
    expect(priorForm).toMatch(/name="scopeInstanceKey"[^>]*value="card:a:performance:spend"/);
    if (existing) {
      expect(priorForm).toMatch(/name="version"[^>]*value="7"/);
      expect(priorForm).toMatch(/name="amount"[^>]*value="300000"/);
      expect(text(html)).toContain("적용 총실적 300,000원");
    } else {
      expect(priorForm).toContain('name="entryId"');
      expect(text(html)).toContain("적용 총실적 확인 필요");
    }
  });
  it("shows the replayed previous-month total even without a manual total", () => {
    const source = inputs({ transactions: [transaction("jan", 300000, "2026-01-02T00:00:00Z")] });
    const w = buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
    const html = renderToStaticMarkup(<CardPerformanceDetail userCard={w.inputs.cards[0]} transactions={w.transactions} summary={w.summaries[0]} workspace={w} state={parseCardsQuery({}, "2026-02")} />);
    expect(text(html)).toContain("적용 총실적 300,000원");
  });
  it("connects detail month inputs, targets, provenance and services without changing tab state", () => {
    const source = inputs({ transactions: [transaction("one")] }); const w = buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
    const html = renderToStaticMarkup(<CardPerformanceDetail userCard={w.inputs.cards[0]} transactions={w.transactions} summary={w.summaries[0]} workspace={w} state={parseCardsQuery({ tab: "transactions" }, "2026-02")} canMutate />);
    const content = text(html);
    expect(content).toContain("전월 총실적"); expect(content).toContain("목표 구간"); expect(content).toContain("자료 상태"); expect(content).toContain("한도 사용 현황");
    expect(html).toMatch(/name="inputMonth"[^>]*value="2026-01"/);
    expect(html).not.toContain("실적 진행률");
  });
});
