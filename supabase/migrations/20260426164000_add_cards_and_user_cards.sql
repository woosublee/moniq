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

alter table public.transactions
  add column if not exists user_card_id uuid references public.user_cards(id) on delete set null;

alter table public.cards enable row level security;
alter table public.user_cards enable row level security;

create policy "allow anon select cards"
  on public.cards
  for select
  to anon
  using (true);

create policy "allow anon select user_cards"
  on public.user_cards
  for select
  to anon
  using (true);

create policy "allow anon insert user_cards"
  on public.user_cards
  for insert
  to anon
  with check (true);

create policy "allow anon update user_cards"
  on public.user_cards
  for update
  to anon
  using (true)
  with check (true);

insert into public.cards (issuer, name, card_type, network, annual_fee, searchable_text)
values
  ('신한카드', 'Deep Dream', 'credit_card', 'VISA', 10000, '신한카드 Deep Dream deep dream visa'),
  ('삼성카드', 'taptap O', 'credit_card', 'MASTER', 10000, '삼성카드 taptap O taptap master'),
  ('현대카드', 'M CHECK', 'check_card', 'VISA', 0, '현대카드 M CHECK m check visa'),
  ('KB국민카드', '탄탄대로 올쇼핑', 'credit_card', 'MASTER', 15000, 'KB국민카드 탄탄대로 올쇼핑 master'),
  ('우리카드', 'DA@카드의정석', 'credit_card', 'VISA', 12000, '우리카드 DA 카드의정석 visa')
on conflict do nothing;
