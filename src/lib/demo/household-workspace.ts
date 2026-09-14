import type { ReplayInputs } from "@/features/card-benefits/engine-types";
import type { MonthKey } from "@/features/card-benefits/periods";
import type { CardPolicy } from "@/features/card-benefits/policy-schema";
import type {
  CardMonthInputRecord,
  CardRuleVersionRecord,
} from "@/features/card-benefits/types";
import { replayLedger } from "@/features/card-benefits/replay";
import type { CardInstanceRecord } from "@/features/cards/types";
import type { IncomeEntryRecord, LedgerWorkspace } from "@/features/ledger/types";
import type {
  LedgerTransactionRecord,
  PaymentMethod,
  TransactionAdjustmentRecord,
} from "@/features/transactions/types";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";

export const demoWorkspaceMonth: MonthKey = "2026-02";

const createdAt = "2026-01-01T00:00:00.000Z";

const cards: CardInstanceRecord[] = [
  {
    id: "demo-everyday",
    owner_id: DEMO_OWNER_ID,
    card_id: "demo-product-everyday",
    alias: "생활비 카드",
    is_default: true,
    version: "1",
    created_at: createdAt,
    last_four: null,
    issued_on: null,
    tracking_started_on: "2026-01-01",
    sort_order: 0,
    archived_at: null,
    target_scope_key: "spend",
    target_tier_key: "base",
    card: {
      id: "demo-product-everyday",
      issuer: "Moniq 가상",
      name: "생활비 카드",
      card_type: "credit_card",
      network: null,
      annual_fee: null,
      image_url: null,
      benefit_support_status: "full",
      benefit_summary: "카페와 정기구독 생활 혜택",
      searchable_text: "Moniq 가상 생활비 카드 카페 정기구독",
      created_at: createdAt,
    },
  },
  {
    id: "demo-transport",
    owner_id: DEMO_OWNER_ID,
    card_id: "demo-product-transport",
    alias: "교통 카드",
    is_default: false,
    version: "1",
    created_at: createdAt,
    last_four: null,
    issued_on: null,
    tracking_started_on: "2026-01-01",
    sort_order: 1,
    archived_at: null,
    target_scope_key: "spend",
    target_tier_key: "base",
    card: {
      id: "demo-product-transport",
      issuer: "Moniq 가상",
      name: "교통 카드",
      card_type: "credit_card",
      network: null,
      annual_fee: null,
      image_url: null,
      benefit_support_status: "full",
      benefit_summary: "대중교통 이용 혜택",
      searchable_text: "Moniq 가상 교통 카드 대중교통",
      created_at: createdAt,
    },
  },
  {
    id: "demo-check",
    owner_id: DEMO_OWNER_ID,
    card_id: "demo-product-check",
    alias: "체크 카드",
    is_default: false,
    version: "1",
    created_at: createdAt,
    last_four: null,
    issued_on: null,
    tracking_started_on: "2026-01-01",
    sort_order: 2,
    archived_at: null,
    target_scope_key: null,
    target_tier_key: null,
    card: {
      id: "demo-product-check",
      issuer: "Moniq 가상",
      name: "체크 카드",
      card_type: "check_card",
      network: null,
      annual_fee: null,
      image_url: null,
      benefit_support_status: "full",
      benefit_summary: "서점 이용 혜택",
      searchable_text: "Moniq 가상 체크 카드 서점",
      created_at: createdAt,
    },
  },
];

const spendScope = (thresholds: [number, number]): CardPolicy["performanceScopes"][number] => ({
  key: "spend",
  contributorSlots: ["self"],
  basis: "gross",
  exclusions: [],
  tiers: [
    { key: "base", minimumSpend: thresholds[0] },
    { key: "plus", minimumSpend: thresholds[1] },
  ],
});

const fixedBenefit = (
  key: string,
  category: string,
  amount: number,
): CardPolicy["benefits"][number] => ({
  key,
  benefitKind: "discount",
  unit: { kind: "won" },
  reward: { kind: "fixed", amount },
  performance: { kind: "none" },
  conditions: [
    { kind: "category", values: [category] },
    { kind: "minimum_amount", amount: 1 },
  ],
  recognitionBasis: "gross",
  quotaKeys: [],
  transactionLimit: null,
});

const policies: Record<string, CardPolicy> = {
  "demo-product-everyday": {
    schemaVersion: 1,
    performanceScopes: [spendScope([300000, 500000])],
    quotas: [],
    benefits: [
      fixedBenefit("cafe", "카페", 500),
      fixedBenefit("subscription", "구독", 1000),
    ],
    cancellation: { kind: "verified_original_month_net_replay" },
  },
  "demo-product-transport": {
    schemaVersion: 1,
    performanceScopes: [spendScope([100000, 200000])],
    quotas: [],
    benefits: [fixedBenefit("transit", "교통", 200)],
    cancellation: { kind: "verified_original_month_net_replay" },
  },
  "demo-product-check": {
    schemaVersion: 1,
    performanceScopes: [],
    quotas: [],
    benefits: [fixedBenefit("books", "문화", 100)],
    cancellation: { kind: "verified_original_month_net_replay" },
  },
};

const ruleVersions: CardRuleVersionRecord[] = cards.map((card) => ({
  id: `demo-version-${card.id.replace("demo-", "")}`,
  card_id: card.card_id,
  version_label: "가상 생활 예시 1",
  version_order: 1,
  source_url: null,
  effective_from: "2026-01-01",
  effective_until: null,
  checked_on: "2026-01-01",
  verification_status: "verified",
  publication_status: "published",
  policy_json: policies[card.card_id],
  legacy_snapshot: null,
  published_at: createdAt,
  created_at: createdAt,
}));

const transactions: LedgerTransactionRecord[] = [];

function addTransactions(input: {
  prefix: string;
  count: number;
  amount: number;
  merchant: string;
  category: string;
  paymentMethod: PaymentMethod;
  userCardId: string | null;
  fixed?: boolean;
}) {
  for (let index = 0; index < input.count; index += 1) {
    const sequence = transactions.length + 1;
    const day = 1 + ((sequence - 1) % 24);
    const hour = 8 + (sequence % 12);
    transactions.push({
      id: `demo-${input.prefix}-${String(index + 1).padStart(2, "0")}`,
      owner_id: DEMO_OWNER_ID,
      occurred_at: `2026-02-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+09:00`,
      merchant_name: input.merchant,
      merchant_normalized_name: input.merchant,
      performance_exclusion_reason: null,
      calculation_status: "calculated",
      amount: input.amount,
      actual_amount: input.amount,
      benefit_label: null,
      benefit_amount: 0,
      final_amount: input.amount,
      eligible_spend_amount: 0,
      is_performance_eligible: true,
      payment_method: input.paymentMethod,
      ledger_category: input.category,
      is_fixed_cost: input.fixed ?? false,
      user_card_id: input.userCardId,
      memo: null,
      origin: "new",
      version: "1",
      stable_sequence: String(sequence),
      payment_channel: input.paymentMethod === "cash" ? "offline" : "mobile_wallet",
      installment_months: 1,
      input_excluded: false,
      legacy_review_required: false,
    });
  }
}

addTransactions({ prefix: "grocery", count: 20, amount: 15000, merchant: "한빛마트", category: "식비", paymentMethod: "credit_card", userCardId: "demo-everyday" });
addTransactions({ prefix: "cafe", count: 12, amount: 5000, merchant: "동네카페", category: "카페", paymentMethod: "credit_card", userCardId: "demo-everyday" });
addTransactions({ prefix: "bus", count: 8, amount: 2000, merchant: "서울버스", category: "교통", paymentMethod: "credit_card", userCardId: "demo-transport" });
addTransactions({ prefix: "book", count: 6, amount: 12000, merchant: "온라인서점", category: "문화", paymentMethod: "check_card", userCardId: "demo-check" });
addTransactions({ prefix: "pharmacy", count: 4, amount: 8000, merchant: "우리약국", category: "건강", paymentMethod: "cash", userCardId: null });
addTransactions({ prefix: "music", count: 4, amount: 9000, merchant: "음악구독", category: "구독", paymentMethod: "credit_card", userCardId: "demo-everyday", fixed: true });

transactions.push({
  id: "demo-january-grocery",
  owner_id: DEMO_OWNER_ID,
  occurred_at: "2026-01-20T18:00:00+09:00",
  merchant_name: "새해식료품",
  merchant_normalized_name: "새해식료품",
  performance_exclusion_reason: null,
  calculation_status: "calculated",
  amount: 30000,
  actual_amount: 30000,
  benefit_label: null,
  benefit_amount: 0,
  final_amount: 30000,
  eligible_spend_amount: 0,
  is_performance_eligible: true,
  payment_method: "credit_card",
  ledger_category: "식비",
  is_fixed_cost: false,
  user_card_id: "demo-everyday",
  memo: null,
  origin: "new",
  version: "1",
  stable_sequence: "55",
  payment_channel: "offline",
  installment_months: 1,
  input_excluded: false,
  legacy_review_required: false,
});

const adjustments: TransactionAdjustmentRecord[] = [
  {
    id: "demo-refund-grocery",
    owner_id: DEMO_OWNER_ID,
    transaction_id: "demo-grocery-01",
    kind: "refund",
    occurred_at: "2026-02-26T14:00:00+09:00",
    amount: 15000,
    origin: "new",
    version: "1",
    stable_sequence: "56",
    memo: "당월 환불 예시",
    voided_at: null,
    created_at: "2026-02-26T05:00:00.000Z",
  },
  {
    id: "demo-refund-january-grocery",
    owner_id: DEMO_OWNER_ID,
    transaction_id: "demo-january-grocery",
    kind: "refund",
    occurred_at: "2026-02-27T15:00:00+09:00",
    amount: 10000,
    origin: "new",
    version: "1",
    stable_sequence: "57",
    memo: "다른 달 원거래 환불 예시",
    voided_at: null,
    created_at: "2026-02-27T06:00:00.000Z",
  },
];

const monthInputs: CardMonthInputRecord[] = ["2026-01", "2026-02", "2026-03"].flatMap((month) =>
  cards
    .filter((card) => card.target_scope_key)
    .map((card) => ({
      id: `${card.id}-${month}-spend`,
      owner_id: DEMO_OWNER_ID,
      month: `${month}-01`,
      scope_kind: "performance" as const,
      scope_key: "spend",
      scope_instance_key: `card:${card.id}:performance:spend`,
      data_status: "complete" as const,
      amount: null,
      version: "1",
      updated_at: createdAt,
    })),
);

const incomes: IncomeEntryRecord[] = [
  {
    id: "demo-income-salary",
    owner_id: DEMO_OWNER_ID,
    version: "1",
    stable_sequence: "58",
    occurred_at: "2026-02-25T09:00:00+09:00",
    source_name: "2월 급여",
    amount: 3200000,
    ledger_category: "급여",
    memo: null,
    input_excluded: false,
    created_at: "2026-02-25T00:00:00.000Z",
    updated_at: "2026-02-25T00:00:00.000Z",
  },
  {
    id: "demo-income-class",
    owner_id: DEMO_OWNER_ID,
    version: "1",
    stable_sequence: "59",
    occurred_at: "2026-02-14T18:00:00+09:00",
    source_name: "주말 강의료",
    amount: 300000,
    ledger_category: "부수입",
    memo: null,
    input_excluded: false,
    created_at: "2026-02-14T09:00:00.000Z",
    updated_at: "2026-02-14T09:00:00.000Z",
  },
  {
    id: "demo-income-excluded",
    owner_id: DEMO_OWNER_ID,
    version: "1",
    stable_sequence: "60",
    occurred_at: "2026-02-10T12:00:00+09:00",
    source_name: "정산 제외 예시",
    amount: 50000,
    ledger_category: "기타수입",
    memo: "합계 제외 상태 예시",
    input_excluded: true,
    created_at: "2026-02-10T03:00:00.000Z",
    updated_at: "2026-02-10T03:00:00.000Z",
  },
];

function demoInputs(): ReplayInputs {
  return {
    ownerId: DEMO_OWNER_ID,
    startMonth: "2026-01",
    cards: structuredClone(cards),
    ruleVersions: structuredClone(ruleVersions),
    memberships: [],
    transactions: structuredClone(transactions),
    adjustments: structuredClone(adjustments),
    annotations: [],
    monthInputs: structuredClone(monthInputs),
    merchantRules: [],
  };
}

/** Read-only presentation snapshot. It never calls authenticated loaders or mutation RPCs. */
export function getDemoHouseholdWorkspace(month: MonthKey): LedgerWorkspace {
  const inputs = demoInputs();
  return {
    cardWorkspace: buildCardWorkspace(inputs, "1", month, replayLedger(inputs, month)),
    incomeSource: { status: "supported", entries: structuredClone(incomes) },
  };
}
