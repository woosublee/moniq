create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  merchant_name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  benefit_amount numeric(12, 2) not null default 0 check (benefit_amount >= 0),
  eligible_spend_amount numeric(12, 2) not null check (eligible_spend_amount >= 0),
  payment_method text not null check (
    payment_method in ('cash', 'credit_card', 'check_card', 'points')
  ),
  card_id text,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "allow anon insert transactions"
  on public.transactions
  for insert
  to anon
  with check (true);

create policy "allow anon select transactions"
  on public.transactions
  for select
  to anon
  using (true);
