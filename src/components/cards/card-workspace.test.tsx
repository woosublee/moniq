import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { CardWorkspaceView } from "./card-workspace";
import { PerformanceTierProgress } from "./performance-tier-progress";
import { getCardWorkspaceBoundaryFixture } from "@/lib/demo/fixtures";
import { parseCardsQuery, workspaceBenefitServices, workspaceQuotaGroups } from "@/features/cards/workspace-view";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { LedgerMutationForm } from "@/components/transactions/ledger-request-fields";
import { inputs, card, version, policy, transaction, membership, monthData, annotation } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
function render(tab = "performance", month = "2026-02") {
  const state = parseCardsQuery({ month, tab }, "2026-02");
  return renderToStaticMarkup(<CardWorkspaceView workspace={getCardWorkspaceBoundaryFixture(state.month)} state={state} canMutate={false} synthetic />);
}
function scopeVersionInputs(reuseInstance = false) {
  const scope = { ...policy().performanceScopes[0], contributorSlots: ["self", "partner"], tiers: [{ key: "top", minimumSpend: 200000 }] };
  const separate = { ...scope, key: "separate", contributorSlots: ["self"], tiers: [{ key: "top", minimumSpend: 40000 }] };
  const newInstance = reuseInstance ? "old-scope" : "new-scope";
  return inputs({
    cards: [card("a"), card("b"), card("c"), card("d")],
    ruleVersions: [
      version("a", policy({ performanceScopes: [scope, separate], benefits: [] }), { effective_until: "2026-02-15" }),
      version("a", policy({ performanceScopes: [{ ...scope, tiers: [{ key: "top", minimumSpend: 600000 }] }, separate], benefits: [] }), { id: "v-a-new", version_order: 2, effective_from: "2026-02-15" }),
      version("b", policy({ performanceScopes: [scope], benefits: [] })),
      ...["c", "d"].map(id => version(id, policy({ performanceScopes: [], benefits: [] }))),
    ],
    memberships: [membership("a", "b", "performance", "spend", "old-scope"), membership("a", "c", "performance", "spend", newInstance, { rule_version_id: "v-a-new" }), membership("b", "d")],
    transactions: [transaction("early-partner", 250000, "2026-02-02T01:00:00Z", "b"), transaction("late-partner", 100000, "2026-02-20T01:00:00Z", "c", 2), transaction("not-transitive", 900000, "2026-02-03T01:00:00Z", "d", 3)],
    monthInputs: [...new Set(["old-scope", newInstance])].map(instance => monthData("2026-02", "performance", "spend", { status: "complete" }, instance)).concat(monthData("2026-02", "performance", "separate")),
  });
}
function renderSource(source: ReturnType<typeof inputs>, tab = "performance") {
  const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
  const html = renderToStaticMarkup(<CardWorkspaceView workspace={workspace} state={parseCardsQuery({ tab, card: "a" }, "2026-02")} canMutate={false} />);
  return { workspace, html };
}
const scopeSections = (html: string) => html.match(/<section\b[^>]*class="workspace-scope"[\s\S]*?<\/section>/g) ?? [];

const serviceSections = (html: string) => html.match(/<div class="workspace-service"[\s\S]*?<\/div>/g) ?? [];
function benefitVersionInputs(sameKey = false) {
  const base = policy().benefits[0];
  return inputs({ ruleVersions: [
    version("a", policy({ performanceScopes: [], benefits: [{ ...base, key: "early-cafe", performance: { kind: "none" } }] }), { version_label: "가상 초기", effective_until: "2026-02-15" }),
    version("a", policy({ performanceScopes: [{ ...policy().performanceScopes[0], tiers: [{ key: "base", minimumSpend: 1 }] }],
      quotas: [{ key: "visits", consumption: { kind: "count" }, sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 5 } }],
      benefits: [{ ...base, key: sameKey ? "early-cafe" : "late-bakery", benefitKind: "points", unit: { kind: "points", program: "synthetic-blue" }, reward: { kind: "fixed", amount: 700 }, performance: { kind: "current_month", scopeKey: "spend", timing: "including_transaction" }, quotaKeys: ["visits"] }],
    }), { id: "v-a-new", version_label: "가상 후기", version_order: 2, effective_from: "2026-02-15" }),
  ], transactions: [transaction("early", 10000)] });
}

describe("card workspace display states", () => {
  it.each([false, true])("keeps an independent 100 won service complete beside unidentified points (confirmed=%s)", (confirmed) => {
    const base = policy().benefits[0];
    const source = inputs({ ruleVersions: [version("a", policy({ performanceScopes: [], benefits: [
      { ...base, key: "known-won", performance: { kind: "none" }, reward: { kind: "fixed", amount: 100 }, combination: { kind: "stack", with: ["unknown-points"], priority: 0 } },
      { ...base, key: "unknown-points", benefitKind: "points", performance: { kind: "none" }, reward: { kind: "fixed", amount: 500 }, combination: { kind: "stack", with: ["known-won"], priority: 1 } },
    ] }))], transactions: [transaction("mixed", 10000)], annotations: confirmed ? [annotation("mixed", 100, "confirmed_benefit", { target_key: "known-won" })] : [] });
    const { workspace, html } = renderSource(source, "benefits");
    const projection = workspace.transactions[0].workspace!.projection;
    expect(projection.benefits.find(benefit => benefit.key === "known-won")).toMatchObject({ appliedAmount: 100, status: "calculated", reasons: [], appliedSource: confirmed ? "confirmed" : "auto" });
    expect(projection.benefits.find(benefit => benefit.key === "unknown-points")).toMatchObject({ appliedAmount: null, unit: null, status: "unknown", reasons: ["unit_unknown"] });
    expect(workspace.transactions[0].workspace!.benefitDisplay.complete).toBe(false);
    expect(workspace.summaries[0].benefitDisplay!.complete).toBe(false);
    const services = workspaceBenefitServices(workspace, workspace.summaries[0]);
    expect.soft(services.find(service => service.key === "known-won")?.incomplete).toBe(false);
    expect(services.find(service => service.key === "unknown-points")?.incomplete).toBe(true);
    const known = serviceSections(html).map(text).find(service => service.includes("known-won"))!;
    expect(known).toContain(`100원 (${confirmed ? "명시 확정" : "자동"})`);
    expect.soft(known).not.toContain("합계 확인 필요");
    expect.soft(known).not.toContain("알려진 부분");
    expect(serviceSections(html).map(text).find(service => service.includes("unknown-points"))).toContain("단위 확인 필요");
    const total = text(html.match(/<dl class="workspace-amounts benefit-total"[\s\S]*?<\/dl>/)![0]);
    expect(total).toContain("합계 확인 필요");
    expect(total).toContain(`알려진 부분 100원 (${confirmed ? "명시 확정" : "자동"})`);
  });
  it.each([
    { targetKind: "benefit_eligible" as const, targetKey: null, incomplete: true },
    { targetKind: "confirmed_benefit" as const, targetKey: null, incomplete: true },
    { targetKind: "benefit_eligible" as const, targetKey: "removed-service", incomplete: false },
    { targetKind: "performance" as const, targetKey: null, incomplete: false },
  ])("limits unallocated $targetKind/$targetKey uncertainty to affected services", ({ targetKind, targetKey, incomplete }) => {
    const source = inputs({ ruleVersions: [version("a", policy({ performanceScopes: [], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, reward: { kind: "fixed", amount: 100 } }] }))], transactions: [transaction("one")], annotations: [annotation("one", "0.125", targetKind, { target_key: targetKey, review_status: "needs_review", origin: "legacy_manual" })] });
    const { workspace, html } = renderSource(source, "benefits");
    expect(workspace.transactions[0].workspace!.projection.unallocatedAnnotations).toHaveLength(1);
    expect(workspaceBenefitServices(workspace, workspace.summaries[0])[0].incomplete).toBe(incomplete);
    const service = text(serviceSections(html)[0]!);
    expect(service).toContain("100원 (자동)");
    if (incomplete) expect(service).toContain("합계 확인 필요");
    else expect(service).not.toContain("합계 확인 필요");
    expect(workspace.summaries[0].benefitDisplay!.complete).toBe(targetKind === "performance");
  });
  it("keeps a service incomplete when conflicting corrections make its applied amount unknown", () => {
    const source = inputs({ ruleVersions: [version("a", policy({ performanceScopes: [], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, reward: { kind: "fixed", amount: 100 } }] }))], transactions: [transaction("one")], annotations: [annotation("one", 100, "confirmed_benefit"), annotation("one", 200, "confirmed_benefit", { id: "conflicting-confirmation" })] });
    const { workspace, html } = renderSource(source, "benefits");
    expect(workspace.transactions[0].workspace!.projection.benefits[0]).toMatchObject({ status: "calculated", appliedAmount: null, reasons: ["annotation_allocation_unknown"] });
    expect(workspaceBenefitServices(workspace, workspace.summaries[0])[0].incomplete).toBe(true);
    expect(text(serviceSections(html)[0]!)).toContain("합계 확인 필요");
  });
  it("retains an ended benefit service beside unused month-end services", () => {
    const { workspace, html } = renderSource(benefitVersionInputs(), "benefits");
    expect(workspace.transactions[0].workspace?.projection).toMatchObject({ ruleVersionId: "v-a", benefits: [{ key: "early-cafe", appliedAmount: 500 }] });
    const services = serviceSections(html).map(text);
    expect(services.find(service => service.includes("early-cafe"))).toContain("500원 (자동)");
    expect(services.find(service => service.includes("late-bakery"))).toContain("적용 내역 없음");
  });
  it("keeps identical benefit keys in different versions separate with their conditions, units and sources", () => {
    const source = benefitVersionInputs(true);
    const { html } = renderSource({ ...source, transactions: [...source.transactions, transaction("late", 10000, "2026-02-20T01:00:00Z", "a", 2)], monthInputs: [...source.monthInputs, monthData("2026-02", "quota", "visits")], annotations: [annotation("late", 700, "confirmed_benefit", { target_key: "early-cafe", basis_rule_version_id: "v-a-new" })] }, "benefits");
    const services = serviceSections(html).map(text).filter(service => service.includes("early-cafe"));
    expect(services).toHaveLength(2);
    const early = services.find(service => service.includes("가상 초기"))!;
    const late = services.find(service => service.includes("가상 후기"))!;
    expect(early).toContain("500원 (자동)");
    expect(early).toContain("실적 조건 없음");
    expect(early).toContain("2026-02-15");
    expect(early).not.toContain("synthetic-blue");
    expect(early).not.toContain("visits");
    expect(late).toContain("700포인트 (synthetic-blue) (명시 확정)");
    expect(late).toContain("당월 실적 · spend");
    expect(late).toContain("연결 한도 visits");
    expect(late).not.toContain("500원");
  });
  it("preserves an applied service when its exact definition is unavailable instead of borrowing the new one", () => {
    const source = benefitVersionInputs(true);
    const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
    // Deliberately incomplete presentation input: replay money must not be discarded.
    workspace.inputs = { ...source, ruleVersions: source.ruleVersions.filter(row => row.id !== "v-a") };
    const html = renderToStaticMarkup(<CardWorkspaceView workspace={workspace} state={parseCardsQuery({ tab: "benefits" }, "2026-02")} canMutate={false} />);
    const known = serviceSections(html).map(text).find(service => service.includes("500원"));
    expect(known).toContain("혜택 조건·적용 판본 확인 필요");
    expect(known).toContain("합계 확인 필요 · 알려진 부분 500원");
    expect(workspaceBenefitServices(workspace, workspace.summaries[0]).find(service => service.versionId === "v-a")?.incomplete).toBe(true);
    expect(known).not.toContain("당월 실적");
    expect(known).not.toContain("연결 한도 visits");
  });
  it("keeps old/new same-key scope thresholds and direct target-card contributors separate", () => {
    const { workspace, html } = renderSource(scopeVersionInputs());
    const scopes = workspace.summaries.find(summary => summary.userCard.id === "a")!.workspace!.performance;
    expect(scopes.find(scope => scope.scopeInstanceKey === "old-scope")).toMatchObject({ amount: 250000, status: "highest_tier", reasons: [] });
    expect(scopes.find(scope => scope.scopeInstanceKey === "new-scope")).toMatchObject({ amount: 100000, status: "unmet", reasons: [] });
    const oldScope = scopeSections(html).find(section => text(section).includes("인정 실적 250,000원"))!;
    const newScope = scopeSections(html).find(section => text(section).includes("인정 실적 100,000원"))!;
    expect(text(oldScope)).toContain("200,000원");
    expect(text(oldScope)).not.toContain("600,000원");
    expect(text(oldScope)).toContain("Synthetic a, Synthetic b");
    expect(text(oldScope)).not.toMatch(/Synthetic [cd]/);
    expect(text(newScope)).toContain("600,000원");
    expect(text(newScope)).toContain("Synthetic a, Synthetic c");
    expect(text(newScope)).not.toMatch(/Synthetic [bd]/);
    expect(text(html)).not.toContain("1,250,000원");
    expect(scopeSections(html).find(section => section.includes('aria-label="실적 범위 separate"'))).toContain('aria-valuemax="40000"');
  });
  it("withholds conflicting same-instance metadata without hiding independent scopes or known money", () => {
    const { html } = renderSource(scopeVersionInputs(true));
    const spend = scopeSections(html).find(section => section.includes('aria-label="실적 범위 spend"'))!;
    expect(text(spend)).toContain("실적 기준·합산 대상 확인 필요");
    expect(text(spend)).toContain("인정 실적 350,000원");
    expect(spend).not.toContain('role="meter"');
    expect(text(spend)).not.toContain("Synthetic a, Synthetic c");
    expect(text(spend)).not.toContain("250,000원");
    expect(scopeSections(html).find(section => section.includes('aria-label="실적 범위 separate"'))).toContain('role="meter"');
  });
  it("keeps earlier scopes visible when the month-end policy has no requirement", () => {
    const source = scopeVersionInputs();
    const { html } = renderSource({ ...source, ruleVersions: source.ruleVersions.map(row => row.id === "v-a-new" ? version("a", policy({ performanceScopes: [], benefits: [] }), { id: "v-a-new", version_order: 2, effective_from: "2026-02-15" }) : row) });
    expect(text(html)).toContain("인정 실적 250,000원");
    expect(html).toContain('aria-label="1구간 200,000원, 달성"');
    expect(text(html)).toContain("Synthetic a, Synthetic b");
  });
  it("respects stored card order rather than replay identifier order", () => {
    const html = render();
    expect(html.indexOf('data-card-id="demo-highest"')).toBeLessThan(html.indexOf('data-card-id="demo-free"'));
  });
  it("pins management commands to the selected month instead of the current clock", () => {
    const html = renderToStaticMarkup(<LedgerMutationForm action={async () => ({ status: "success", message: "" })} version="4" month="2026-02"><button>보관</button></LedgerMutationForm>);
    expect(html).toContain('name="month" value="2026-02"');
  });
  it("keeps recognized spend, actual spend and next tier in reference reading order", () => {
    const html = text(render()).split("가상 최고 구간 카드")[0];
    expect(html.indexOf("인정 실적")).toBeLessThan(html.indexOf("사용금액"));
    expect(html.indexOf("사용금액")).toBeLessThan(html.indexOf("다음 구간까지"));
  });
  it("separates achieved target, highest tier, known zero, no requirement and missing data", () => {
    const html = render();
    expect(text(html)).toContain("내 목표 달성");
    expect(text(html)).toContain("최고 구간 달성");
    expect(text(html)).toContain("실적 조건 없음");
    expect(text(html)).toContain("입력 자료 확인 필요");
    expect(text(html)).toContain("입력 완료 · 사용 0원");
    expect(html).not.toContain("보관</button>");
  });
  it("does not render achievement bars for unverified and no-requirement cards", () => {
    const source = inputs({ cards: [card("unknown"), card("free")], ruleVersions: [version("free", policy({ performanceScopes: [], benefits: [] }))] });
    const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
    const html = renderToStaticMarkup(<CardWorkspaceView workspace={workspace} state={parseCardsQuery({}, "2026-02")} canMutate={false} />);
    expect(html).not.toContain('role="meter"');
    expect(text(html)).toContain("약관·적용 기간 확인 필요");
    expect(text(html)).toContain("실적 조건 없음");
  });
  it("renders independent scopes without adding their recognition twice", () => {
    const scope = policy().performanceScopes[0];
    const source = inputs({ ruleVersions: [version("a", policy({ performanceScopes: [scope, { ...scope, key: "separate" }] }))], transactions: [transaction("one", 350000)] });
    const workspace = buildCardWorkspace(source, "1", "2026-02", replayLedger(source, "2026-02"));
    const html = text(renderToStaticMarkup(<CardWorkspaceView workspace={workspace} state={parseCardsQuery({}, "2026-02")} canMutate={false} />));
    expect(html).toContain("spend");
    expect(html).toContain("separate");
    expect(html).not.toContain("700,000원");
  });
  it("keeps programs, applied sources and one shared quota distinct", () => {
    const html = text(render("benefits"));
    expect(html).toContain("포인트 (demo-blue)");
    expect(html).toContain("마일 (demo-air)");
    expect(html).toContain("명시 확정");
    expect(html).toContain("공유 한도");
    expect(html).toContain("남은 횟수");
    expect(html).toContain("확인 필요 이유");
    expect(html).not.toContain("99,999원");
  });
  it("renders empty search/month feedback and never serializes raw owner snapshot", () => {
    const html = render("transactions", "2026-01");
    expect(text(html)).toContain("사용내역이 없습니다");
    expect(html).not.toContain(DEMO_OWNER_ID);
    expect(html).not.toContain("basis_input_revision");
  });
  it("preserves the test-only long-name, 71-row, shared-quota boundary without account digits", () => {
    const workspace = getCardWorkspaceBoundaryFixture("2026-02");
    expect(workspace.ownerId).toBe(DEMO_OWNER_ID);
    expect(workspace.inputs.cards.every(card => card.last_four === null && card.card.name.includes("가상"))).toBe(true);
    expect(workspace.inputs.cards[0].card.name).toBe("매일을 차곡차곡 모으는 아주 긴 이름의 가상 생활 카드");
    expect(workspace.inputs.transactions).toHaveLength(71);
    expect(workspaceQuotaGroups(workspace).some(group => group.shared)).toBe(true);
  });
  it("provides actual thresholds and current amount outside hover, with step semantics", () => {
    const html = renderToStaticMarkup(<PerformanceTierProgress tiers={[{ key: "base", minimumSpend: 200000 }, { key: "plus", minimumSpend: 500000 }]} amount={350000} targetKey="base" label="생활 실적" />);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="350000"');
    expect(text(html)).toContain("구간별 간격은 동일");
    expect(text(html)).toContain("200,000원");
    expect(text(html)).toContain("500,000원");
    expect(html).toContain('width:75%');
  });
});
