create table if not exists public.card_benefit_rules (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  name text not null,
  benefit_kind text not null check (
    benefit_kind in ('discount', 'cashback', 'points', 'statement_credit')
  ),
  calculation_method text not null check (
    calculation_method in ('percent', 'fixed_amount')
  ),
  rate numeric(7, 4),
  fixed_amount numeric(12, 2),
  min_payment_amount numeric(12, 2) not null default 0 check (min_payment_amount >= 0),
  max_benefit_amount numeric(12, 2) check (max_benefit_amount is null or max_benefit_amount >= 0),
  cap_period text not null default 'none' check (cap_period in ('transaction', 'monthly', 'none')),
  match_merchant_keywords text[] not null default '{}',
  match_ledger_categories text[] not null default '{}',
  exclude_merchant_keywords text[] not null default '{}',
  exclude_ledger_categories text[] not null default '{}',
  requires_performance boolean not null default false,
  priority integer not null default 100,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  condition_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (rate is not null or fixed_amount is not null),
  check (rate is null or rate >= 0),
  check (fixed_amount is null or fixed_amount >= 0),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.card_performance_requirements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  label text not null,
  required_spend_amount numeric(12, 2) not null check (required_spend_amount >= 0),
  period_type text not null default 'calendar_month' check (period_type in ('calendar_month')),
  benefit_period_offset_months integer not null default 0,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.transaction_benefit_applications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  user_card_id uuid references public.user_cards(id) on delete set null,
  card_benefit_rule_id uuid references public.card_benefit_rules(id) on delete set null,
  label text,
  source text not null check (source in ('auto', 'manual', 'legacy_manual')),
  benefit_amount numeric(12, 2) not null default 0 check (benefit_amount >= 0),
  eligible_spend_amount numeric(12, 2) not null default 0 check (eligible_spend_amount >= 0),
  calculation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists card_benefit_rules_card_id_active_idx
  on public.card_benefit_rules(card_id, is_active);

create index if not exists card_performance_requirements_card_id_active_idx
  on public.card_performance_requirements(card_id, is_active);

create index if not exists transaction_benefit_applications_transaction_id_idx
  on public.transaction_benefit_applications(transaction_id);

create index if not exists transaction_benefit_applications_owner_user_card_idx
  on public.transaction_benefit_applications(owner_id, user_card_id);

create index if not exists transactions_owner_user_card_occurred_at_idx
  on public.transactions(owner_id, user_card_id, occurred_at desc);

alter table public.card_benefit_rules enable row level security;
alter table public.card_performance_requirements enable row level security;
alter table public.transaction_benefit_applications enable row level security;

drop policy if exists "allow anon select card benefit rules" on public.card_benefit_rules;
create policy "allow anon select card benefit rules"
  on public.card_benefit_rules
  for select
  to anon
  using (true);

drop policy if exists "allow anon select card performance requirements" on public.card_performance_requirements;
create policy "allow anon select card performance requirements"
  on public.card_performance_requirements
  for select
  to anon
  using (true);

insert into public.transaction_benefit_applications (
  transaction_id,
  owner_id,
  user_card_id,
  label,
  source,
  benefit_amount,
  eligible_spend_amount,
  calculation_snapshot
)
select
  id,
  owner_id,
  user_card_id,
  benefit_label,
  'legacy_manual',
  benefit_amount,
  eligible_spend_amount,
  jsonb_build_object('source', 'legacy_transaction_fields')
from public.transactions
where benefit_amount > 0
  and not exists (
    select 1
    from public.transaction_benefit_applications existing
    where existing.transaction_id = public.transactions.id
      and existing.source = 'legacy_manual'
  );
