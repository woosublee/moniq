import type { ReplayInputs } from "@/features/card-benefits/engine-types";
import type { MonthKey } from "@/features/card-benefits/periods";
import type { CardPolicy } from "@/features/card-benefits/policy-schema";
import { replayLedger } from "@/features/card-benefits/replay";
import type {
  CardMonthInputRecord,
  CardPerformanceRequirementRecord,
  CardRuleVersionRecord,
  TransactionBenefitApplicationRecord,
} from "@/features/card-benefits/types";
import type { CardInstanceRecord, CardRecord, UserCardRecord } from "@/features/cards/types";
import type { LedgerTransactionRecord, TransactionFilters, TransactionRecord } from "@/features/transactions/types";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { demoWorkspaceMonth, getDemoHouseholdWorkspace } from "@/lib/demo/household-workspace";

function householdCardWorkspace() {
  return getDemoHouseholdWorkspace(demoWorkspaceMonth).cardWorkspace;
}

export function getDemoCards(query = ""): CardRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return householdCardWorkspace().inputs.cards
    .map((row) => row.card)
    .filter((card) => !normalizedQuery || card.searchable_text.toLocaleLowerCase("ko-KR").includes(normalizedQuery))
    .map((card) => structuredClone(card));
}

export function getDemoUserCards(): UserCardRecord[] {
  return householdCardWorkspace().inputs.cards.map((card) => structuredClone(card));
}

export function getDemoUserCard(userCardId: string) {
  return getDemoUserCards().find((userCard) => userCard.id === userCardId) ?? null;
}

export function getDemoTransactions(filters: TransactionFilters = {}): TransactionRecord[] {
  return householdCardWorkspace().transactions
    .filter((transaction) => {
      const day = transaction.workspace?.projection.day;
      return !transaction.input_excluded
        && (!filters.startDate || !!day && day >= filters.startDate)
        && (!filters.endDate || !!day && day <= filters.endDate)
        && (!filters.paymentMethod || filters.paymentMethod === "all" || transaction.payment_method === filters.paymentMethod)
        && (!filters.userCardId || transaction.user_card_id === filters.userCardId);
    })
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .map((transaction) => structuredClone(transaction));
}

export function getDemoBenefitApplications(transactionIds: string[]): TransactionBenefitApplicationRecord[] {
  const ids = new Set(transactionIds);
  return householdCardWorkspace().transactions
    .filter((transaction) => ids.has(transaction.id))
    .flatMap((transaction) => transaction.workspace?.projection.benefits
      .filter((benefit) => benefit.appliedAmount !== null && benefit.appliedAmount > 0)
      .map((benefit) => ({
        id: `${transaction.id}-${benefit.key}`,
        transaction_id: transaction.id,
        owner_id: DEMO_OWNER_ID,
        user_card_id: transaction.user_card_id,
        card_benefit_rule_id: benefit.key,
        label: benefit.key,
        source: benefit.appliedSource === "auto" ? "auto" as const : "manual" as const,
        benefit_amount: benefit.appliedAmount!,
        eligible_spend_amount: transaction.workspace?.eligibleSpendAmount ?? 0,
        calculation_snapshot: {
          demoCase: "shared_household_replay",
          ruleVersionId: transaction.workspace?.projection.ruleVersionId ?? null,
        },
        created_at: transaction.occurred_at,
      })) ?? []);
}

export const demoPerformanceRequirements: CardPerformanceRequirementRecord[] = householdCardWorkspace().summaries.flatMap((summary) =>
  summary.requiredSpendAmount === null
    ? []
    : [{
      id: `demo-requirement-${summary.userCard.id}`,
      card_id: summary.userCard.card_id,
      label: `생활 예시 ${summary.requiredSpendAmount.toLocaleString("ko-KR")}원`,
      required_spend_amount: summary.requiredSpendAmount,
      period_type: "calendar_month" as const,
      benefit_period_offset_months: 0,
      starts_on: null,
      ends_on: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    }],
);

/**
 * Test-only stress fixture retained from Tasks 7/17. Public demo pages must not use it.
 * It preserves the long name, 71 rows, shared scopes/quotas and unknown boundaries.
 */
export function getCardWorkspaceBoundaryFixture(month: MonthKey) {
  const createdAt = "2026-01-01T00:00:00Z";
  const names = [
    ["everyday", "매일을 차곡차곡 모으는 아주 긴 이름의 가상 생활 카드"],
    ["highest", "가상 최고 구간 카드"], ["shared", "가상 함께 쓰는 카드"],
    ["partner", "가상 합산 대상 카드"], ["free", "가상 포인트·마일 카드"],
    ["unknown", "가상 약관 검증 대기 카드"], ["missing", "가상 입력 자료 부족 카드"], ["zero", "가상 사용 없는 카드"],
  ];
  const cards: CardInstanceRecord[] = names.map(([id, name], index) => ({
    id: `demo-${id}`, owner_id: DEMO_OWNER_ID, card_id: `demo-product-${id}`, alias: null, is_default: index === 0,
    version: "1", created_at: createdAt, last_four: null, issued_on: null, tracking_started_on: "2026-01-01", sort_order: index,
    archived_at: null, target_scope_key: id === "everyday" ? "spend" : null, target_tier_key: id === "everyday" ? "base" : null,
    card: { id: `demo-product-${id}`, issuer: "Moniq 가상", name, card_type: "credit_card", network: null, annual_fee: null,
      image_url: null, benefit_support_status: "none", benefit_summary: "UI 시나리오 전용 · 실제 상품 약관 아님", searchable_text: name, created_at: createdAt },
  }));
  const scope: CardPolicy["performanceScopes"][number] = { key: "spend", contributorSlots: ["self"], basis: "gross", exclusions: [],
    tiers: [{ key: "base", minimumSpend: 200000 }, { key: "plus", minimumSpend: 500000 }, { key: "highest", minimumSpend: 1100000 }] };
  const benefit: CardPolicy["benefits"][number] = { key: "coffee", benefitKind: "discount", unit: { kind: "won" }, reward: { kind: "fixed", amount: 100 },
    performance: { kind: "none" }, conditions: [], recognitionBasis: "gross", quotaKeys: [], transactionLimit: null };
  const rules: Record<string, CardPolicy> = Object.fromEntries(names.map(([id]) => [id, { schemaVersion: 1, performanceScopes: [scope], benefits: [], quotas: [], cancellation: { kind: "verified_original_month_net_replay" } }]));
  rules.everyday = { ...rules.everyday, quotas: [
    { key: "daily", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 10000 } },
    { key: "visits", sharing: { kind: "independent" }, consumption: { kind: "count" }, limit: { kind: "fixed", amount: 100 } },
  ], benefits: [
    { ...benefit, key: "cafe", conditions: [{ kind: "category", values: ["cafe"] }], quotaKeys: ["daily", "visits"] },
    { ...benefit, key: "bakery", conditions: [{ kind: "category", values: ["bakery"] }], quotaKeys: ["daily"] },
  ] };
  rules.shared = { ...rules.shared, performanceScopes: [{ ...scope, contributorSlots: ["self", "partner"] }] };
  rules.free = { ...rules.free, performanceScopes: [], benefits: [
    { ...benefit, key: "points", benefitKind: "points", unit: { kind: "points", program: "demo-blue" }, reward: { kind: "fixed", amount: 500 }, combination: { kind: "stack", with: ["miles"], priority: 0 } },
    { ...benefit, key: "miles", benefitKind: "points", unit: { kind: "miles", program: "demo-air" }, reward: { kind: "fixed", amount: 25 }, combination: { kind: "stack", with: ["points"], priority: 1 } },
  ] };
  const versions: CardRuleVersionRecord[] = names.filter(([id]) => id !== "unknown").map(([id]) => ({
    id: `demo-version-${id}`, card_id: `demo-product-${id}`, version_label: "가상 시나리오 1", version_order: 1, source_url: null,
    effective_from: "2026-01-01", effective_until: null, checked_on: "2026-01-01", verification_status: "verified", publication_status: "published",
    policy_json: rules[id], legacy_snapshot: null, published_at: createdAt, created_at: createdAt,
  }));
  const monthInputs: CardMonthInputRecord[] = ["2026-01", "2026-02"].flatMap(inputMonth => cards.filter(card => card.id !== "demo-missing").map(card => ({
    id: `${card.id}-${inputMonth}`, owner_id: DEMO_OWNER_ID, month: `${inputMonth}-01`, scope_kind: "performance" as const, scope_key: "spend",
    scope_instance_key: `card:${card.id}:performance:spend`, data_status: "complete" as const, amount: null, version: "1", updated_at: createdAt,
  })));
  for (const key of ["daily", "visits"]) monthInputs.push({ id: `demo-${key}`, owner_id: DEMO_OWNER_ID, month: "2026-02-01", scope_kind: "quota", scope_key: key,
    scope_instance_key: `card:demo-everyday:quota:${key}`, data_status: "complete", amount: null, version: "1", updated_at: createdAt });
  const transactions: LedgerTransactionRecord[] = [];
  const add = (id: string, amount: number, category = "cafe") => {
    const sequence = transactions.length + 1;
    transactions.push({ id: `demo-transaction-${sequence}`, owner_id: DEMO_OWNER_ID, occurred_at: `2026-02-${String(2 + sequence % 20).padStart(2, "0")}T01:00:00Z`,
      merchant_name: category === "cafe" ? "가상 동네 카페" : "가상 동네 베이커리", merchant_normalized_name: null, amount, actual_amount: amount,
      benefit_label: null, benefit_amount: 0, final_amount: amount, eligible_spend_amount: 0, is_performance_eligible: true,
      payment_method: "credit_card", ledger_category: category, is_fixed_cost: false, user_card_id: `demo-${id}`, memo: null,
      performance_exclusion_reason: null, calculation_status: "calculated", origin: "new", version: "1", stable_sequence: sequence,
      payment_channel: "offline", installment_months: 1, input_excluded: false, legacy_review_required: false });
  };
  for (let i = 0; i < 65; i += 1) add("everyday", 5000, i % 2 ? "bakery" : "cafe");
  add("everyday", 25000); add("highest", 1200000); add("shared", 100000); add("partner", 50000); add("free", 10000); add("unknown", 10000);
  const freeTransaction = transactions.find(row => row.user_card_id === "demo-free")!;
  const source: ReplayInputs = { ownerId: DEMO_OWNER_ID, startMonth: month < "2026-01" ? month : "2026-01", cards, ruleVersions: versions, transactions,
    memberships: [{ id: "demo-direct-contributor", owner_id: DEMO_OWNER_ID, target_user_card_id: "demo-shared", contributor_user_card_id: "demo-partner", rule_version_id: "demo-version-shared", scope_kind: "performance", scope_key: "spend", scope_instance_key: "card:demo-shared:performance:spend", contributor_slot: "partner", valid_from_month: "2026-01-01", valid_until_month: null, version: "1" }],
    adjustments: [], annotations: [{ id: "demo-confirmed-points", owner_id: DEMO_OWNER_ID, transaction_id: freeTransaction.id, target_kind: "confirmed_benefit", target_key: "points", scope_instance_key: null, amount: 500, origin: "manual", review_status: "resolved", basis_auto_amount: 500, basis_input_revision: "1", basis_rule_version_id: "demo-version-free", legacy_application_id: null, legacy_snapshot: null, version: "1", voided_at: null, created_at: createdAt }],
    monthInputs, merchantRules: [] };
  return buildCardWorkspace(source, "1", month, replayLedger(source, month));
}
