create extension if not exists pgcrypto;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  name text not null,
  card_type text not null check (card_type in ('credit_card', 'check_card')),
  network text,
  annual_fee integer,
  image_url text,
  searchable_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_cards (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  alias text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists user_cards_card_id_unique
  on public.user_cards(card_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  merchant_name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  actual_amount numeric(12, 2) not null,
  benefit_label text,
  benefit_amount numeric(12, 2) not null default 0 check (benefit_amount >= 0),
  final_amount numeric(12, 2) not null,
  eligible_spend_amount numeric(12, 2) not null check (eligible_spend_amount >= 0),
  is_performance_eligible boolean not null default true,
  payment_method text not null check (
    payment_method in ('cash', 'credit_card', 'check_card', 'points')
  ),
  ledger_category text,
  is_fixed_cost boolean not null default false,
  user_card_id uuid references public.user_cards(id) on delete set null,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.cards enable row level security;
alter table public.user_cards enable row level security;
alter table public.transactions enable row level security;
