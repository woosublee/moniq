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
