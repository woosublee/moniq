# External MVP Card Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 3-month external-user-ready Moniq MVP: demo mode, Supabase Auth, simple transaction entry, automatic merchant/category/benefit/performance calculation, card dashboards, explainable calculation results, and public-demo quality UI.

**Architecture:** Keep UI thin and move product logic into server actions, query helpers, and pure domain modules. Introduce an owner context so authenticated users, read-only demo users, and development fallback share the same app flows without leaking data. Keep card benefit/performance rules admin-managed via migrations and seed data, while users only add cards and transactions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, PostgreSQL RLS, Tailwind CSS v4, Zod. Read `node_modules/next/dist/docs/01-app/index.md` before touching App Router files.

---

## Ground Rules

- Do not implement user-facing card benefit rule CRUD.
- Do not add LLM-based categorization or recommendation.
- Do not add card company syncing or automatic transaction imports.
- Keep transaction creation simple: merchant, card, amount, date.
- Use deterministic rules for merchant normalization, category assignment, benefit calculation, performance calculation, and recommendations.
- Use migration/seed/admin data for card rules.
- Run `npm run lint` after every task that touches TypeScript, TSX, or config.
- Run the app and manually verify user-facing flows after UI tasks.
- Do not commit unless the user explicitly asks for commits.

---

## File Structure Map

### Existing files to modify

- `package.json` — add test scripts and test dependencies if using Vitest.
- `.env.example` — add demo owner/auth-related environment variables.
- `src/lib/server-env.ts` — expose demo owner id and keep development fallback owner id.
- `src/lib/supabase/server.ts` — keep service-role server client for admin-like server operations, and add auth-aware helpers only when needed.
- `src/lib/supabase/client.ts` — keep browser client for auth UI.
- `src/lib/supabase/queries.ts` — either keep temporarily or split into focused query modules as tasks progress.
- `src/app/layout.tsx` — keep global shell and metadata.
- `src/app/page.tsx` — turn into landing/dashboard router depending on owner context.
- `src/components/layout/site-header.tsx` — add demo/auth state entry points.
- `src/app/cards/actions.ts` — switch to owner context and block demo mutations.
- `src/app/cards/page.tsx` — render owner-aware card summaries and support status.
- `src/app/cards/search/page.tsx` — show card calculation support status.
- `src/components/cards/user-cards-list.tsx` — show support status, performance, benefit summary, and detail links.
- `src/features/cards/types.ts` — add support status fields.
- `src/app/transactions/new/actions.ts` — switch to owner context, simple creation, automatic calculation, manual override update behavior.
- `src/app/transactions/new/page.tsx` — keep ledger list but update copy and filters.
- `src/components/transactions/transaction-form.tsx` — split quick-create and detailed-edit modes.
- `src/components/transactions/transaction-create-dialog.tsx` — use quick-create mode.
- `src/components/transactions/transaction-edit-dialog.tsx` — use detailed-edit mode.
- `src/components/transactions/transactions-table.tsx` — show calculation status, benefit, performance, support labels.
- `src/features/transactions/types.ts` — add calculation status, merchant normalization, exclusion reason.
- `src/features/transactions/validation.ts` — add quick-create schema and detailed-edit schema.
- `src/features/transactions/mappers.ts` — map new transaction fields.
- `src/features/card-benefits/types.ts` — add support status, performance exclusion rule, explanation types.
- `src/features/card-benefits/calculation.ts` — keep orchestration or move rule matching/performance pieces into focused files.
- `src/features/card-benefits/mappers.ts` — include calculation status and exclusion reason in inserts.
- `src/features/card-benefits/validation.ts` — validate calculation status and support status when needed.
- `supabase/schema.sql` — mirror final schema.

### New files to create

- `src/lib/auth/owner.ts` — owner context resolution and demo mutation guard.
- `src/lib/supabase/queries/cards.ts` — card/user-card queries.
- `src/lib/supabase/queries/transactions.ts` — transaction queries.
- `src/lib/supabase/queries/card-benefits.ts` — benefit/performance/merchant rule queries.
- `src/features/merchants/types.ts` — merchant rule and normalization result types.
- `src/features/merchants/normalize.ts` — pure merchant/category normalization.
- `src/features/card-benefits/rule-matching.ts` — benefit rule matching helpers.
- `src/features/card-benefits/performance.ts` — performance requirement/exclusion calculation.
- `src/features/card-benefits/explanations.ts` — structured calculation explanation strings.
- `src/features/card-benefits/recommendations.ts` — simple card insight/recommendation helpers.
- `src/features/transactions/calculation.ts` — transaction calculation orchestration boundary.
- `src/app/demo/page.tsx` — explicit demo entry route.
- `src/app/auth/page.tsx` — simple auth entry page.
- `src/app/auth/actions.ts` — sign-in/sign-out server actions if server-auth flow is selected.
- `src/app/cards/[userCardId]/page.tsx` — card detail page.
- `src/components/auth/auth-panel.tsx` — email/magic-link UI or email/password UI.
- `src/components/demo/demo-banner.tsx` — read-only demo notice.
- `src/components/cards/card-support-badge.tsx` — support status badge.
- `src/components/cards/card-performance-detail.tsx` — card detail performance/benefit sections.
- `src/components/transactions/quick-transaction-form.tsx` — four-field create form.
- `src/components/transactions/transaction-calculation-summary.tsx` — display saved calculation result.
- `src/components/transactions/transaction-status-badge.tsx` — calculation status badge.
- `src/components/dashboard/dashboard-summary.tsx` — dashboard summary cards.
- `src/components/dashboard/card-insights.tsx` — card progress and simple recommendations.
- `supabase/migrations/20260601090000_external_mvp_owner_auth_demo.sql` — owner/RLS/auth/demo migration.
- `supabase/migrations/20260601093000_external_mvp_card_support_and_rules.sql` — support status, merchant rules, exclusion rules.
- `supabase/migrations/20260601100000_external_mvp_demo_seed.sql` — demo owner/cards/transactions seed.
- `src/features/merchants/normalize.test.ts` — merchant normalization tests.
- `src/features/card-benefits/rule-matching.test.ts` — benefit matching tests.
- `src/features/card-benefits/performance.test.ts` — performance/exclusion tests.
- `src/features/transactions/calculation.test.ts` — end-to-end transaction calculation tests.

---

## Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Create: `src/features/merchants/normalize.test.ts`

- [ ] **Step 1: Add Vitest dependency and scripts**

Run:

```bash
npm install -D vitest
```

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Add a smoke test that proves Vitest runs**

Create `src/features/merchants/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs TypeScript tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run test**

Run:

```bash
npm run test -- src/features/merchants/normalize.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

---

## Task 2: Add Owner Context Boundary

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/server-env.ts`
- Create: `src/lib/auth/owner.ts`

- [ ] **Step 1: Extend environment example**

Add to `.env.example`:

```bash
# Optional. Defaults to 00000000-0000-0000-0000-000000000001 for local development fallback.
MONIQ_OWNER_ID=
# Optional. Defaults to 00000000-0000-0000-0000-000000000999 for read-only demo data.
MONIQ_DEMO_OWNER_ID=
```

- [ ] **Step 2: Extend server env**

Modify `src/lib/server-env.ts` so it exposes both owner ids:

```ts
import "server-only";

const defaultMoniqOwnerId = "00000000-0000-0000-0000-000000000001";
const defaultDemoOwnerId = "00000000-0000-0000-0000-000000000999";

const getRequiredServerEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
};

export const serverEnv = {
  get supabaseServiceRoleKey() {
    return getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get moniqOwnerId() {
    return process.env.MONIQ_OWNER_ID || defaultMoniqOwnerId;
  },
  get moniqDemoOwnerId() {
    return process.env.MONIQ_DEMO_OWNER_ID || defaultDemoOwnerId;
  },
};
```

- [ ] **Step 3: Create owner context module**

Create `src/lib/auth/owner.ts`:

```ts
import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "@/lib/server-env";

export type OwnerMode = "authenticated" | "demo" | "development";

export type OwnerContext = {
  ownerId: string;
  mode: OwnerMode;
  canMutate: boolean;
};

const demoCookieName = "moniq_demo";

export async function getOwnerContext(): Promise<OwnerContext> {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get(demoCookieName)?.value === "1";

  if (isDemo) {
    return {
      ownerId: serverEnv.moniqDemoOwnerId,
      mode: "demo",
      canMutate: false,
    };
  }

  return {
    ownerId: serverEnv.moniqOwnerId,
    mode: "development",
    canMutate: true,
  };
}

export function assertCanMutate(owner: OwnerContext) {
  if (!owner.canMutate) {
    throw new Error("데모 모드에서는 데이터를 변경할 수 없습니다.");
  }
}
```

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

---

## Task 3: Switch Current Queries and Actions to Owner Context

**Files:**
- Modify: `src/lib/supabase/queries.ts`
- Modify: `src/app/cards/actions.ts`
- Modify: `src/app/transactions/new/actions.ts`

- [ ] **Step 1: Change query functions to accept owner id where user data is read**

Update signatures in `src/lib/supabase/queries.ts`:

```ts
export const getRecentTransactions = cache(
  async (ownerId: string, filters: TransactionFilters = {}): Promise<TransactionRecord[]> => {
    const supabase = createSupabaseServerClient();
    let request = supabase
      .from("transactions")
      .select(transactionSelect)
      .eq("owner_id", ownerId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    // keep existing filters unchanged
  },
);

export const getCurrentMonthTransactions = cache(
  async (ownerId: string, timezoneOffset = "0"): Promise<TransactionRecord[]> => {
    // same current implementation, but use ownerId instead of serverEnv.moniqOwnerId
  },
);

export const getUserCards = cache(async (ownerId: string): Promise<UserCardRecord[]> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(userCardSelect)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as UserCardRecord[];
});
```

Apply the same owner parameter to:

- `getDefaultUserCard(ownerId)`
- `getBenefitCalculationContext(ownerId, userCardId, occurredAt, timezoneOffset, excludedTransactionId)`
- `getCardPerformanceSummaries(ownerId, timezoneOffset)`

- [ ] **Step 2: Use owner context in card actions**

In `src/app/cards/actions.ts`, replace direct `serverEnv.moniqOwnerId` usage with:

```ts
import { assertCanMutate, getOwnerContext } from "@/lib/auth/owner";
```

Inside each mutation:

```ts
const owner = await getOwnerContext();
assertCanMutate(owner);
const ownerId = owner.ownerId;
```

Then use `ownerId` for count, insert, RPC calls, and deletes.

- [ ] **Step 3: Use owner context in transaction actions**

In `src/app/transactions/new/actions.ts`, replace direct `serverEnv.moniqOwnerId` usage with:

```ts
const owner = await getOwnerContext();
assertCanMutate(owner);
const ownerId = owner.ownerId;
```

Pass `ownerId` to `getBenefitCalculationContext` and `toTransactionInsert`.

- [ ] **Step 4: Update pages using queries**

Update `src/app/page.tsx`, `src/app/cards/page.tsx`, `src/app/transactions/new/page.tsx`, and any other caller:

```ts
const owner = await getOwnerContext();
const [transactions, userCards] = await Promise.all([
  getCurrentMonthTransactions(owner.ownerId),
  getUserCards(owner.ownerId),
]);
```

- [ ] **Step 5: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Manual smoke**

Run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Verify:

- `/` responds 200.
- `/cards` responds 200.
- `/transactions/new` responds 200.

---

## Task 4: Add External MVP Schema Fields

**Files:**
- Create: `supabase/migrations/20260601093000_external_mvp_card_support_and_rules.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/features/cards/types.ts`
- Modify: `src/features/transactions/types.ts`
- Modify: `src/features/card-benefits/types.ts`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260601093000_external_mvp_card_support_and_rules.sql`:

```sql
alter table public.cards
  add column if not exists benefit_support_status text not null default 'none'
    check (benefit_support_status in ('full', 'partial', 'none')),
  add column if not exists benefit_summary text;

alter table public.transactions
  add column if not exists merchant_normalized_name text,
  add column if not exists performance_exclusion_reason text,
  add column if not exists calculation_status text not null default 'no_matching_rule'
    check (calculation_status in ('calculated', 'unsupported_card', 'no_matching_rule', 'missing_performance', 'manual_override'));

create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  normalized_merchant_name text not null,
  ledger_category text not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists merchant_rules_active_priority_idx
  on public.merchant_rules(is_active, priority);

create table if not exists public.card_performance_exclusion_rules (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  label text not null,
  match_merchant_keywords text[] not null default '{}',
  match_ledger_categories text[] not null default '{}',
  exclude_if_benefit_applied boolean not null default false,
  priority integer not null default 100,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists card_performance_exclusion_rules_card_active_idx
  on public.card_performance_exclusion_rules(card_id, is_active);

alter table public.merchant_rules enable row level security;
alter table public.card_performance_exclusion_rules enable row level security;

create policy "allow anon select merchant rules"
  on public.merchant_rules
  for select
  to anon
  using (true);

create policy "allow anon select card performance exclusion rules"
  on public.card_performance_exclusion_rules
  for select
  to anon
  using (true);
```

- [ ] **Step 2: Mirror schema in `supabase/schema.sql`**

Add the same columns, tables, indexes, RLS enablement, and select policies to `supabase/schema.sql`.

- [ ] **Step 3: Update card type**

In `src/features/cards/types.ts`, add:

```ts
export type CardBenefitSupportStatus = "full" | "partial" | "none";
```

Extend `CardRecord` with:

```ts
benefit_support_status: CardBenefitSupportStatus;
benefit_summary: string | null;
```

- [ ] **Step 4: Update transaction types**

In `src/features/transactions/types.ts`, add:

```ts
export type TransactionCalculationStatus =
  | "calculated"
  | "unsupported_card"
  | "no_matching_rule"
  | "missing_performance"
  | "manual_override";
```

Extend `TransactionInsert` and `TransactionRecord`:

```ts
merchant_normalized_name: string | null;
performance_exclusion_reason: string | null;
calculation_status: TransactionCalculationStatus;
```

- [ ] **Step 5: Update card-benefit types**

In `src/features/card-benefits/types.ts`, add:

```ts
export type CardPerformanceExclusionRuleRecord = {
  id: string;
  card_id: string;
  label: string;
  match_merchant_keywords: string[];
  match_ledger_categories: string[];
  exclude_if_benefit_applied: boolean;
  priority: number;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
};
```

- [ ] **Step 6: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

---

## Task 5: Add Merchant Normalization

**Files:**
- Create: `src/features/merchants/types.ts`
- Create: `src/features/merchants/normalize.ts`
- Create: `src/features/merchants/normalize.test.ts`
- Modify: `src/lib/supabase/queries.ts`

- [ ] **Step 1: Write failing tests**

Replace `src/features/merchants/normalize.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import { normalizeMerchant } from "@/features/merchants/normalize";
import type { MerchantRuleRecord } from "@/features/merchants/types";

const rules: MerchantRuleRecord[] = [
  {
    id: "rule-starbucks",
    keyword: "스타벅스",
    normalized_merchant_name: "스타벅스",
    ledger_category: "카페",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rule-starbucks-en",
    keyword: "STARBUCKS",
    normalized_merchant_name: "스타벅스",
    ledger_category: "카페",
    priority: 20,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rule-coupang",
    keyword: "쿠팡",
    normalized_merchant_name: "쿠팡",
    ledger_category: "쇼핑",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("normalizeMerchant", () => {
  it("normalizes Korean merchant aliases", () => {
    expect(normalizeMerchant("스타벅스 강남R", rules)).toEqual({
      originalMerchantName: "스타벅스 강남R",
      normalizedMerchantName: "스타벅스",
      ledgerCategory: "카페",
      ruleId: "rule-starbucks",
    });
  });

  it("normalizes English aliases case-insensitively", () => {
    expect(normalizeMerchant("starbucks gangnam", rules)).toEqual({
      originalMerchantName: "starbucks gangnam",
      normalizedMerchantName: "스타벅스",
      ledgerCategory: "카페",
      ruleId: "rule-starbucks-en",
    });
  });

  it("falls back to the original name and 기타", () => {
    expect(normalizeMerchant("동네문구", rules)).toEqual({
      originalMerchantName: "동네문구",
      normalizedMerchantName: "동네문구",
      ledgerCategory: "기타",
      ruleId: null,
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- src/features/merchants/normalize.test.ts
```

Expected: FAIL because `normalizeMerchant` does not exist.

- [ ] **Step 3: Add merchant types**

Create `src/features/merchants/types.ts`:

```ts
export type MerchantRuleRecord = {
  id: string;
  keyword: string;
  normalized_merchant_name: string;
  ledger_category: string;
  priority: number;
  is_active: boolean;
  created_at: string;
};

export type MerchantNormalizationResult = {
  originalMerchantName: string;
  normalizedMerchantName: string;
  ledgerCategory: string;
  ruleId: string | null;
};
```

- [ ] **Step 4: Implement normalization**

Create `src/features/merchants/normalize.ts`:

```ts
import type {
  MerchantNormalizationResult,
  MerchantRuleRecord,
} from "@/features/merchants/types";

const normalizeText = (value: string) => value.trim().toLowerCase();

export function normalizeMerchant(
  merchantName: string,
  rules: MerchantRuleRecord[],
): MerchantNormalizationResult {
  const originalMerchantName = merchantName.trim();
  const normalizedInput = normalizeText(originalMerchantName);
  const matchedRule = rules
    .filter((rule) => rule.is_active)
    .sort((a, b) => a.priority - b.priority)
    .find((rule) => normalizedInput.includes(normalizeText(rule.keyword)));

  if (!matchedRule) {
    return {
      originalMerchantName,
      normalizedMerchantName: originalMerchantName,
      ledgerCategory: "기타",
      ruleId: null,
    };
  }

  return {
    originalMerchantName,
    normalizedMerchantName: matchedRule.normalized_merchant_name,
    ledgerCategory: matchedRule.ledger_category,
    ruleId: matchedRule.id,
  };
}
```

- [ ] **Step 5: Add query for merchant rules**

In `src/lib/supabase/queries.ts`, add:

```ts
const merchantRuleSelect =
  "id, keyword, normalized_merchant_name, ledger_category, priority, is_active, created_at";

export const getMerchantRules = cache(async (): Promise<MerchantRuleRecord[]> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("merchant_rules")
    .select(merchantRuleSelect)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as MerchantRuleRecord[];
});
```

Also import `MerchantRuleRecord`.

- [ ] **Step 6: Run tests and lint**

Run:

```bash
npm run test -- src/features/merchants/normalize.test.ts
npm run lint
```

Expected: PASS.

---

## Task 6: Split Benefit Rule Matching and Performance Calculation

**Files:**
- Create: `src/features/card-benefits/rule-matching.ts`
- Create: `src/features/card-benefits/performance.ts`
- Create: `src/features/card-benefits/rule-matching.test.ts`
- Create: `src/features/card-benefits/performance.test.ts`
- Modify: `src/features/card-benefits/calculation.ts`

- [ ] **Step 1: Move matching helpers into `rule-matching.ts`**

Create `src/features/card-benefits/rule-matching.ts` with the matching helpers currently in `calculation.ts`:

```ts
import type {
  BenefitCalculationInput,
  CardBenefitRuleRecord,
} from "@/features/card-benefits/types";

export const toMoneyNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const includesAnyKeyword = (value: string, keywords: string[]) => {
  const normalizedValue = normalize(value);

  return keywords.some((keyword) => normalizedValue.includes(normalize(keyword)));
};

const matchesList = (value: string | null | undefined, targets: string[]) => {
  if (targets.length === 0) {
    return true;
  }

  const normalizedValue = normalize(value);

  return targets.some((target) => normalizedValue === normalize(target));
};

const isRuleActive = (rule: CardBenefitRuleRecord, occurredAt: string) => {
  const occurredDate = occurredAt.slice(0, 10);

  return (
    rule.is_active &&
    (!rule.starts_on || occurredDate >= rule.starts_on) &&
    (!rule.ends_on || occurredDate <= rule.ends_on)
  );
};

const isRuleMatched = (input: BenefitCalculationInput, rule: CardBenefitRuleRecord) => {
  if (!isRuleActive(rule, input.occurredAt)) {
    return false;
  }

  if (toMoneyNumber(input.actualAmount) < toMoneyNumber(rule.min_payment_amount)) {
    return false;
  }

  if (
    rule.match_merchant_keywords.length > 0 &&
    !includesAnyKeyword(input.merchantName, rule.match_merchant_keywords)
  ) {
    return false;
  }

  if (!matchesList(input.ledgerCategory, rule.match_ledger_categories)) {
    return false;
  }

  if (
    rule.exclude_merchant_keywords.length > 0 &&
    includesAnyKeyword(input.merchantName, rule.exclude_merchant_keywords)
  ) {
    return false;
  }

  if (
    input.ledgerCategory &&
    rule.exclude_ledger_categories.some((category) => normalize(category) === normalize(input.ledgerCategory))
  ) {
    return false;
  }

  return true;
};

export const matchBenefitRules = (
  input: BenefitCalculationInput,
  rules: CardBenefitRuleRecord[],
) => rules.filter((rule) => isRuleMatched(input, rule)).sort((a, b) => a.priority - b.priority);
```

- [ ] **Step 2: Create performance helper**

Create `src/features/card-benefits/performance.ts`:

```ts
import type {
  BenefitCalculationInput,
  CardPerformanceExclusionRuleRecord,
} from "@/features/card-benefits/types";

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const includesAnyKeyword = (value: string, keywords: string[]) => {
  const normalizedValue = normalize(value);

  return keywords.some((keyword) => normalizedValue.includes(normalize(keyword)));
};

const matchesCategory = (value: string | null | undefined, categories: string[]) => {
  if (categories.length === 0) {
    return true;
  }

  return categories.some((category) => normalize(category) === normalize(value));
};

const isRuleActive = (rule: CardPerformanceExclusionRuleRecord, occurredAt: string) => {
  const occurredDate = occurredAt.slice(0, 10);

  return (
    rule.is_active &&
    (!rule.starts_on || occurredDate >= rule.starts_on) &&
    (!rule.ends_on || occurredDate <= rule.ends_on)
  );
};

export function getPerformanceExclusionReason({
  input,
  rules,
  benefitApplied,
}: {
  input: BenefitCalculationInput;
  rules: CardPerformanceExclusionRuleRecord[];
  benefitApplied: boolean;
}) {
  const matchedRule = rules
    .filter((rule) => isRuleActive(rule, input.occurredAt))
    .sort((a, b) => a.priority - b.priority)
    .find((rule) => {
      if (rule.exclude_if_benefit_applied && !benefitApplied) {
        return false;
      }

      if (
        rule.match_merchant_keywords.length > 0 &&
        !includesAnyKeyword(input.merchantName, rule.match_merchant_keywords)
      ) {
        return false;
      }

      return matchesCategory(input.ledgerCategory, rule.match_ledger_categories);
    });

  return matchedRule?.label ?? null;
}
```

- [ ] **Step 3: Update calculation imports**

In `src/features/card-benefits/calculation.ts`, remove duplicated helper definitions and import:

```ts
import {
  matchBenefitRules,
  toMoneyNumber,
} from "@/features/card-benefits/rule-matching";
import { getPerformanceExclusionReason } from "@/features/card-benefits/performance";
```

Extend `BenefitCalculationContext` in `types.ts` with:

```ts
performanceExclusionRules: CardPerformanceExclusionRuleRecord[];
```

When calculating a result, compute:

```ts
const performanceExclusionReason = getPerformanceExclusionReason({
  input,
  rules: context.performanceExclusionRules,
  benefitApplied: bestBenefit?.benefitAmount ? bestBenefit.benefitAmount > 0 : false,
});
const isPerformanceEligible = !performanceExclusionReason && input.isPerformanceEligible;
```

Add `performanceExclusionReason` and `calculationStatus` to `BenefitCalculationResult`.

- [ ] **Step 4: Add tests for matching and performance**

Create `rule-matching.test.ts` with tests for merchant match, category match, minimum amount, excluded category, priority sorting.

Create `performance.test.ts` with tests for category exclusion, merchant keyword exclusion, benefit-applied exclusion, inactive rule ignored.

Use concrete fixtures in each test file; do not share hidden global fixtures.

- [ ] **Step 5: Run tests and lint**

Run:

```bash
npm run test -- src/features/card-benefits/rule-matching.test.ts src/features/card-benefits/performance.test.ts
npm run lint
```

Expected: PASS.

---

## Task 7: Add Transaction Calculation Orchestrator

**Files:**
- Create: `src/features/transactions/calculation.ts`
- Create: `src/features/transactions/calculation.test.ts`
- Modify: `src/app/transactions/new/actions.ts`
- Modify: `src/features/transactions/mappers.ts`

- [ ] **Step 1: Write transaction calculation tests**

Create `src/features/transactions/calculation.test.ts` with cases:

- supported card + matching rule → `calculated`
- unsupported card → `unsupported_card`
- supported card + no rule → `no_matching_rule`
- performance exclusion → `calculated` with `eligibleSpendAmount = 0`

The first test should assert:

```ts
expect(result).toMatchObject({
  merchantNormalizedName: "스타벅스",
  ledgerCategory: "카페",
  label: "카페 5% 할인",
  benefitAmount: 600,
  finalAmount: 11400,
  eligibleSpendAmount: 11400,
  calculationStatus: "calculated",
});
```

- [ ] **Step 2: Implement orchestrator**

Create `src/features/transactions/calculation.ts`:

```ts
import { calculateTransactionBenefit } from "@/features/card-benefits/calculation";
import type { BenefitCalculationContext } from "@/features/card-benefits/types";
import { normalizeMerchant } from "@/features/merchants/normalize";
import type { MerchantRuleRecord } from "@/features/merchants/types";
import type { TransactionInput } from "@/features/transactions/types";

export function calculateTransaction(input: TransactionInput, context: BenefitCalculationContext, merchantRules: MerchantRuleRecord[]) {
  const merchant = normalizeMerchant(input.merchantName, merchantRules);
  const normalizedInput = {
    ...input,
    merchantName: merchant.normalizedMerchantName,
    ledgerCategory: input.ledgerCategory || merchant.ledgerCategory,
  };
  const result = calculateTransactionBenefit(normalizedInput, context);

  return {
    ...result,
    merchantNormalizedName: merchant.normalizedMerchantName,
    ledgerCategory: normalizedInput.ledgerCategory,
  };
}
```

- [ ] **Step 3: Use orchestrator in server actions**

In `src/app/transactions/new/actions.ts`, replace direct `calculateTransactionBenefit` call with:

```ts
const [context, merchantRules] = await Promise.all([
  getBenefitCalculationContext(ownerId, parsed.data.userCardId, parsed.data.occurredAt, String(parsed.data.timezoneOffset)),
  getMerchantRules(),
]);
const calculationResult = calculateTransaction(parsed.data, context, merchantRules);
```

Map `merchantNormalizedName`, `ledgerCategory`, `performanceExclusionReason`, and `calculationStatus` into the transaction insert.

- [ ] **Step 4: Update mappers**

In `src/features/transactions/mappers.ts`, ensure `toTransactionInsert` accepts calculation-derived overrides or add `applyTransactionCalculationResult` in the action. Store:

```ts
merchant_normalized_name: result.merchantNormalizedName,
ledger_category: result.ledgerCategory || null,
performance_exclusion_reason: result.performanceExclusionReason,
calculation_status: result.calculationStatus,
```

- [ ] **Step 5: Run tests and lint**

Run:

```bash
npm run test -- src/features/transactions/calculation.test.ts
npm run lint
```

Expected: PASS.

---

## Task 8: Simplify Transaction Creation UI and Preserve Detailed Edit

**Files:**
- Create: `src/components/transactions/quick-transaction-form.tsx`
- Modify: `src/components/transactions/transaction-form.tsx`
- Modify: `src/components/transactions/transaction-create-dialog.tsx`
- Modify: `src/components/transactions/transaction-edit-dialog.tsx`
- Modify: `src/features/transactions/validation.ts`

- [ ] **Step 1: Split validation schema**

In `src/features/transactions/validation.ts`, keep current detailed parsing for updates and add `parseQuickTransactionInput` for creation:

```ts
export const quickTransactionInputSchema = z.object({
  occurredAt: z.string().min(1, "거래 일시를 입력해 주세요."),
  timezoneOffset: z.number("타임존 정보를 숫자로 입력해 주세요.").finite("타임존 정보가 올바르지 않습니다."),
  merchantName: z.string().trim().min(1, "사용처를 입력해 주세요.").max(80, "사용처는 80자 이하로 입력해 주세요."),
  amount: z.number("금액을 숫자로 입력해 주세요.").finite("금액 형식이 올바르지 않습니다.").positive("금액은 0보다 커야 합니다."),
  userCardId: z.string().uuid("카드를 선택해 주세요."),
});
```

Map quick input into full `TransactionInput` with:

```ts
actualAmount: amount,
benefitLabel: "",
benefitAmount: 0,
finalAmount: amount,
paymentMethod: "credit_card",
isPerformanceEligible: true,
ledgerCategory: "",
isFixedCost: false,
memo: "",
```

- [ ] **Step 2: Create quick form**

Create `src/components/transactions/quick-transaction-form.tsx` with only:

- amount
- merchantName
- userCardId
- occurredAt
- timezone offset hidden input
- submit button
- success/error message

Use existing `SubmitButton` and `TimezoneOffsetInput`.

- [ ] **Step 3: Keep detailed form for edit**

Modify `transaction-form.tsx` copy so it is clearly a detailed editor:

```tsx
<p className="text-lg font-semibold text-slate-950">지출 상세 수정</p>
<p className="text-sm leading-7 text-slate-500">
  자동 계산된 카테고리, 혜택, 실적 인정 금액을 확인하고 필요한 경우 조정하세요.
</p>
```

- [ ] **Step 4: Use quick form in create dialog and create page**

Modify `transaction-create-dialog.tsx` to render `QuickTransactionForm`.

Modify `src/app/transactions/new/page.tsx` so the primary creation area uses `QuickTransactionForm`, while edit dialogs continue using `TransactionForm`.

- [ ] **Step 5: Manual UI verification**

Run dev server and verify:

- Create dialog shows only four user-facing fields.
- Edit dialog still shows detailed fields.
- Creating a transaction stores and shows calculated results.

- [ ] **Step 6: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

---

## Task 9: Add Support Badges and Calculation Status UI

**Files:**
- Create: `src/components/cards/card-support-badge.tsx`
- Create: `src/components/transactions/transaction-status-badge.tsx`
- Modify: `src/components/cards/user-cards-list.tsx`
- Modify: `src/components/transactions/transactions-table.tsx`
- Modify: `src/app/cards/search/page.tsx`

- [ ] **Step 1: Create card support badge**

Create `src/components/cards/card-support-badge.tsx`:

```tsx
import type { CardBenefitSupportStatus } from "@/features/cards/types";

const supportLabels: Record<CardBenefitSupportStatus, string> = {
  full: "혜택 계산 지원",
  partial: "일부 혜택 지원",
  none: "계산 준비 중",
};

const supportClassNames: Record<CardBenefitSupportStatus, string> = {
  full: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200",
  none: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function CardSupportBadge({ status }: { status: CardBenefitSupportStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${supportClassNames[status]}`}>
      {supportLabels[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create transaction status badge**

Create `src/components/transactions/transaction-status-badge.tsx`:

```tsx
import type { TransactionCalculationStatus } from "@/features/transactions/types";

const labels: Record<TransactionCalculationStatus, string> = {
  calculated: "자동 계산",
  unsupported_card: "계산 미지원",
  no_matching_rule: "혜택 없음",
  missing_performance: "실적 부족",
  manual_override: "수동 수정",
};

export function TransactionStatusBadge({ status }: { status: TransactionCalculationStatus }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
      {labels[status]}
    </span>
  );
}
```

- [ ] **Step 3: Add badges to card UI**

Use `CardSupportBadge` in:

- `user-cards-list.tsx`
- `cards/search/page.tsx`

Show `card.benefit_summary` below the badge when present.

- [ ] **Step 4: Add status badge to transaction rows**

Use `TransactionStatusBadge` in `transactions-table.tsx` next to merchant/card metadata.

Display `performance_exclusion_reason` when present.

- [ ] **Step 5: Run lint and manual verify**

Run:

```bash
npm run lint
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Verify `/cards`, `/cards/search`, `/transactions/new` show the new badges.

---

## Task 10: Add Demo Mode Entry

**Files:**
- Create: `src/app/demo/page.tsx`
- Create: `src/components/demo/demo-banner.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/layout/site-header.tsx`
- Create: `supabase/migrations/20260601100000_external_mvp_demo_seed.sql`

- [ ] **Step 1: Create demo page action by cookie route**

Create `src/app/demo/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DemoPage() {
  const cookieStore = await cookies();
  cookieStore.set("moniq_demo", "1", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });

  redirect("/");
}
```

- [ ] **Step 2: Create demo banner**

Create `src/components/demo/demo-banner.tsx`:

```tsx
import type { OwnerContext } from "@/lib/auth/owner";

export function DemoBanner({ owner }: { owner: OwnerContext }) {
  if (owner.mode !== "demo") {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
      데모 모드입니다. 샘플 데이터는 읽기 전용이며, 내 데이터로 사용하려면 로그인해 주세요.
    </div>
  );
}
```

- [ ] **Step 3: Add landing actions**

On `src/app/page.tsx`, when there are no user cards and no transactions in development/auth mode, show:

```tsx
<Link href="/demo">데모로 보기</Link>
<Link href="/auth">내 카드로 시작하기</Link>
```

- [ ] **Step 4: Seed demo owner data**

Create `supabase/migrations/20260601100000_external_mvp_demo_seed.sql` with:

- demo owner id `00000000-0000-0000-0000-000000000999`
- 3 supported cards
- 1 unsupported card
- user_cards for demo owner
- transactions covering:
  - benefit applied
  - no matching rule
  - performance exclusion
  - unsupported card

Use existing card/rule seed patterns from current migrations.

- [ ] **Step 5: Block demo mutations in UI**

Pass owner context into pages that render create/add/delete buttons. Hide or disable mutation buttons when `owner.canMutate === false` with the message:

```text
데모 모드에서는 샘플 데이터를 변경할 수 없습니다.
```

- [ ] **Step 6: Manual verify**

Run dev server and verify:

- `/demo` redirects to `/`.
- `/` shows demo banner.
- Demo data appears.
- Mutation buttons are hidden or disabled.

---

## Task 11: Add Supabase Auth Entry

**Files:**
- Create: `src/app/auth/page.tsx`
- Create: `src/components/auth/auth-panel.tsx`
- Modify: `src/lib/auth/owner.ts`
- Modify: `src/components/layout/site-header.tsx`
- Create: `supabase/migrations/20260601090000_external_mvp_owner_auth_demo.sql`

- [ ] **Step 1: Add RLS/auth migration**

Create `supabase/migrations/20260601090000_external_mvp_owner_auth_demo.sql`:

```sql
create policy "allow authenticated select own user cards"
  on public.user_cards
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "allow authenticated insert own user cards"
  on public.user_cards
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "allow authenticated update own user cards"
  on public.user_cards
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "allow authenticated delete own user cards"
  on public.user_cards
  for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "allow authenticated select own transactions"
  on public.transactions
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "allow authenticated insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "allow authenticated update own transactions"
  on public.transactions
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "allow authenticated delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (owner_id = auth.uid());
```

Add equivalent policies for `transaction_benefit_applications`.

- [ ] **Step 2: Implement auth panel**

Create `src/components/auth/auth-panel.tsx` as a client component using `supabaseBrowserClient.auth.signInWithOtp` for magic link.

Required UI:

- email input
- submit button
- success message: `로그인 링크를 이메일로 보냈습니다.`
- error message from Supabase

- [ ] **Step 3: Add auth page**

Create `src/app/auth/page.tsx`:

```tsx
import { AuthPanel } from "@/components/auth/auth-panel";
import { PageHeader } from "@/components/layout/page-header";

export default function AuthPage() {
  return (
    <>
      <PageHeader
        eyebrow="시작하기"
        title="내 카드로 Moniq를 시작하세요."
        description="로그인하면 내 카드와 거래를 안전하게 분리해서 저장합니다."
      />
      <AuthPanel />
    </>
  );
}
```

- [ ] **Step 4: Upgrade owner context to authenticated user**

If using Supabase SSR cookie session, add the appropriate Supabase auth client for Next.js 16 App Router after checking local Next/Supabase docs. Update `getOwnerContext()` so authenticated user returns:

```ts
{
  ownerId: user.id,
  mode: "authenticated",
  canMutate: true,
}
```

Keep demo cookie precedence only when explicitly in demo mode.

- [ ] **Step 5: Add auth links to header**

Add links in `site-header.tsx`:

- `데모 보기` → `/demo`
- `로그인` → `/auth`

Show them compactly on mobile.

- [ ] **Step 6: Manual auth verify**

Use Supabase local or project auth settings. Verify:

- magic link sends successfully
- authenticated owner id changes data scope
- unauthenticated fallback still works in local development

---

## Task 12: Add Card Detail Page

**Files:**
- Create: `src/app/cards/[userCardId]/page.tsx`
- Create: `src/components/cards/card-performance-detail.tsx`
- Modify: `src/lib/supabase/queries.ts`
- Modify: `src/components/cards/user-cards-list.tsx`

- [ ] **Step 1: Add focused query**

Add query helper:

```ts
export const getUserCard = cache(async (ownerId: string, userCardId: string): Promise<UserCardRecord | null> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(userCardSelect)
    .eq("owner_id", ownerId)
    .eq("id", userCardId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as UserCardRecord | null;
});
```

Add `getTransactionsForUserCard(ownerId, userCardId, filters)`.

- [ ] **Step 2: Create card detail component**

Create `src/components/cards/card-performance-detail.tsx` rendering:

- performance progress
- remaining spend
- monthly benefit amount
- recognized transaction total
- excluded transaction total
- exclusion reason groups
- recent transactions

- [ ] **Step 3: Create dynamic page**

Create `src/app/cards/[userCardId]/page.tsx`:

- read owner context
- fetch user card
- fetch monthly transactions
- fetch performance summary
- render `notFound()` when card is missing
- render `CardPerformanceDetail`

- [ ] **Step 4: Link card list to detail page**

In `user-cards-list.tsx`, add a link:

```tsx
<Link href={`/cards/${card.id}`}>상세 보기</Link>
```

- [ ] **Step 5: Manual verify**

Verify:

- `/cards/[id]` shows correct card.
- Missing id shows 404.
- Demo mode detail page is read-only.

---

## Task 13: Improve Dashboard and Transaction List

**Files:**
- Create: `src/components/dashboard/dashboard-summary.tsx`
- Create: `src/components/dashboard/card-insights.tsx`
- Create: `src/components/transactions/transaction-calculation-summary.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/transactions/transactions-table.tsx`

- [ ] **Step 1: Extract dashboard summary component**

Create `dashboard-summary.tsx` with props:

```ts
type DashboardSummaryProps = {
  finalAmount: number;
  actualAmount: number;
  benefitAmount: number;
  eligibleSpendAmount: number;
  transactionCount: number;
};
```

Render summary cards for spending, card benefits, performance-recognized spend, transaction count.

- [ ] **Step 2: Add card insights**

Create `card-insights.tsx` that receives `CardPerformanceSummary[]` and renders:

- closest-to-met card
- most-benefit card
- cards with `remainingSpendAmount > 0`

- [ ] **Step 3: Add transaction calculation summary**

Create `transaction-calculation-summary.tsx` that renders:

- benefit label and amount
- final amount
- eligible spend amount
- exclusion reason
- calculation status badge

- [ ] **Step 4: Use components in home and transaction table**

Refactor `src/app/page.tsx` to use `DashboardSummary` and `CardInsights`.

Update `transactions-table.tsx` to use `TransactionCalculationSummary`.

- [ ] **Step 5: Manual verify**

Verify:

- home dashboard value is understandable within 1 minute
- recent transactions show benefits and performance state
- empty state is clear

---

## Task 14: Add Calculation Explanations

**Files:**
- Create: `src/features/card-benefits/explanations.ts`
- Modify: `src/features/card-benefits/calculation.ts`
- Modify: `src/components/transactions/transaction-calculation-summary.tsx`
- Modify: `src/app/cards/[userCardId]/page.tsx`

- [ ] **Step 1: Add explanation builder**

Create `src/features/card-benefits/explanations.ts`:

```ts
import type { BenefitCalculationResult } from "@/features/card-benefits/types";

const moneyFormatter = new Intl.NumberFormat("ko-KR");

export function buildBenefitExplanation(result: BenefitCalculationResult) {
  if (result.calculationStatus === "unsupported_card") {
    return ["이 카드는 아직 혜택 계산을 지원하지 않습니다."];
  }

  if (result.calculationStatus === "no_matching_rule") {
    return ["적용 가능한 혜택이 없습니다."];
  }

  if (result.performanceExclusionReason) {
    return [`실적 제외: ${result.performanceExclusionReason}`];
  }

  if (!result.rule || result.benefitAmount <= 0) {
    return ["혜택 금액이 계산되지 않았습니다."];
  }

  return [
    `${result.label} 적용`,
    `혜택 ${moneyFormatter.format(result.benefitAmount)}원`,
    `최종 지출 ${moneyFormatter.format(result.finalAmount)}원`,
  ];
}
```

- [ ] **Step 2: Store explanation input in snapshot**

In `calculation.ts`, ensure `calculationSnapshot` includes:

- ruleName
- benefitKind
- calculationMethod
- rate or fixedAmount
- benefitAmount
- finalAmount
- eligibleSpendAmount
- performanceExclusionReason

- [ ] **Step 3: Render explanations**

In `transaction-calculation-summary.tsx`, render explanation lines from saved transaction fields and application snapshot.

- [ ] **Step 4: Manual verify**

Create one transaction per status and verify the explanation copy is correct.

---

## Task 15: Add Simple Recommendations

**Files:**
- Create: `src/features/card-benefits/recommendations.ts`
- Modify: `src/components/dashboard/card-insights.tsx`
- Modify: `src/components/transactions/transaction-calculation-summary.tsx`

- [ ] **Step 1: Create recommendation helpers**

Create `src/features/card-benefits/recommendations.ts`:

```ts
import type { CardPerformanceSummary } from "@/features/card-benefits/types";

export function getClosestPerformanceInsight(summaries: CardPerformanceSummary[]) {
  const candidate = summaries
    .filter((summary) => summary.status === "unmet" && summary.remainingSpendAmount > 0)
    .sort((a, b) => a.remainingSpendAmount - b.remainingSpendAmount)[0];

  if (!candidate) {
    return null;
  }

  return `${candidate.userCard.card.name}은 ${new Intl.NumberFormat("ko-KR").format(candidate.remainingSpendAmount)}원만 더 쓰면 실적 조건을 충족해요.`;
}

export function getTopBenefitInsight(summaries: CardPerformanceSummary[]) {
  const candidate = summaries
    .filter((summary) => summary.benefitAmount > 0)
    .sort((a, b) => b.benefitAmount - a.benefitAmount)[0];

  if (!candidate) {
    return null;
  }

  return `이번 달 가장 많은 혜택을 받은 카드는 ${candidate.userCard.card.name}입니다.`;
}
```

- [ ] **Step 2: Render dashboard insights**

Use these helpers in `card-insights.tsx`.

- [ ] **Step 3: Add post-transaction copy**

After successful creation, show the saved transaction calculation result first. Add recommendation copy only if there is a clear better-card calculation available in a future task; for this task, use performance insight only.

- [ ] **Step 4: Run tests and lint**

Add a small test for `recommendations.ts`, then run:

```bash
npm run test -- src/features/card-benefits/recommendations.test.ts
npm run lint
```

Expected: PASS.

---

## Task 16: Seed Representative Cards, Merchant Rules, and Exclusion Rules

**Files:**
- Modify: `supabase/migrations/20260527103000_seed_card_benefit_rules_and_requirements.sql`
- Create: `supabase/migrations/20260601103000_seed_external_mvp_merchant_and_exclusion_rules.sql`

- [ ] **Step 1: Pick representative cards**

Use 5~10 representative cards already present in seed data. Mark their `benefit_support_status` as `full` or `partial`.

- [ ] **Step 2: Add merchant rules**

Create seed rows for:

- 스타벅스 → 카페
- STARBUCKS → 카페
- 쿠팡 → 쇼핑
- 배달의민족 → 식비
- 배민 → 식비
- GS25 → 편의점
- CU → 편의점
- 지하철 → 교통
- 버스 → 교통

- [ ] **Step 3: Add exclusion rules**

Add representative exclusion rules:

- 상품권 category excluded
- 세금/공과금 category excluded
- benefit-applied transactions excluded for one representative card only when the real card rule requires it

- [ ] **Step 4: Update unsupported cards**

Set non-representative cards to:

```sql
benefit_support_status = 'none'
```

Add a plain benefit summary:

```text
혜택 계산 준비 중
```

- [ ] **Step 5: Manual verify with Supabase local/project**

Apply migrations in the target environment and verify:

- card search shows support status
- merchant rules are readable
- exclusion rules are readable

---

## Task 17: Final External MVP Verification Pass

**Files:**
- No required source files unless verification finds bugs.

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run lint
npm run test
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Run app**

Run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

- [ ] **Step 3: Verify demo flow**

In browser:

1. Open `/`.
2. Click `데모로 보기`.
3. Confirm demo banner appears.
4. Confirm dashboard has sample cards and transactions.
5. Confirm mutation controls are blocked or hidden.
6. Open `/cards`.
7. Open a card detail page.
8. Open `/transactions/new`.
9. Confirm transaction data is visible and read-only where needed.

- [ ] **Step 4: Verify development/auth-like owner flow**

In local development fallback:

1. Open `/cards/search`.
2. Add a supported card.
3. Add a quick transaction with `스타벅스`, supported card, `12000`, today.
4. Confirm transaction is saved.
5. Confirm category is `카페`.
6. Confirm benefit amount is calculated.
7. Confirm card performance increases.
8. Open transaction edit dialog.
9. Confirm detailed fields are available.

- [ ] **Step 5: Verify unsupported card flow**

1. Add a card with `benefit_support_status = none`.
2. Add a transaction with that card.
3. Confirm status is `계산 미지원`.
4. Confirm transaction still contributes to ledger spending.

- [ ] **Step 6: Verify mobile layout**

Use browser responsive mode and check:

- landing actions
- quick transaction form
- card list
- transaction table/list
- card detail page

- [ ] **Step 7: Prepare release notes**

Write a short summary in the final response:

- what was implemented
- what was verified
- which cards/rules are supported
- what remains out of scope

---

## Self-Review

### Spec Coverage

- Demo mode: Task 10.
- Supabase Auth: Task 11.
- Owner context: Task 2 and Task 3.
- Simple transaction entry: Task 8.
- Merchant/category automatic classification: Task 5 and Task 16.
- Benefit calculation: Task 6 and Task 7.
- Performance exclusion rules: Task 4, Task 6, Task 16.
- Calculation status: Task 4, Task 7, Task 9.
- Card support status: Task 4, Task 9, Task 16.
- Card dashboard/detail: Task 12 and Task 13.
- Calculation explanations: Task 14.
- Simple insights/recommendations: Task 15.
- External MVP verification: Task 17.

### Placeholder Scan

This plan has no unresolved placeholder markers. Tasks that require real card data explicitly state the target seed rows and support states to create. Auth implementation includes a required documentation check before choosing the final Supabase SSR session helper because the project uses Next.js 16.

### Type Consistency

The plan consistently uses:

- `benefit_support_status` on `cards`
- `benefit_summary` on `cards`
- `merchant_normalized_name` on `transactions`
- `performance_exclusion_reason` on `transactions`
- `calculation_status` on `transactions`
- `CardPerformanceExclusionRuleRecord`
- `MerchantRuleRecord`
- `OwnerContext`
- `TransactionCalculationStatus`

---

## Execution Notes

This document is a plan only. Do not start implementation until the user provides the next concrete target.

Recommended execution mode when implementation starts:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
