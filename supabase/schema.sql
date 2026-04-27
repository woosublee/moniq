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
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  card_id uuid not null references public.cards(id) on delete cascade,
  alias text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists user_cards_owner_id_card_id_unique
  on public.user_cards(owner_id, card_id);

create unique index if not exists user_cards_single_default_per_owner
  on public.user_cards(owner_id)
  where is_default;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
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

create policy "allow anon select cards"
  on public.cards
  for select
  to anon
  using (true);

create or replace function public.set_default_user_card(
  target_owner_id uuid,
  target_user_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_cards
    where id = target_user_card_id
      and owner_id = target_owner_id
  ) then
    raise exception 'user card not found';
  end if;

  update public.user_cards
  set is_default = false
  where owner_id = target_owner_id
    and is_default = true;

  update public.user_cards
  set is_default = true
  where id = target_user_card_id
    and owner_id = target_owner_id;
end;
$$;

create or replace function public.delete_user_card_and_promote_default(
  target_owner_id uuid,
  target_user_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was_default boolean;
  next_user_card_id uuid;
begin
  select is_default
    into was_default
  from public.user_cards
  where id = target_user_card_id
    and owner_id = target_owner_id;

  if was_default is null then
    raise exception 'user card not found';
  end if;

  delete from public.user_cards
  where id = target_user_card_id
    and owner_id = target_owner_id;

  if was_default then
    select id
      into next_user_card_id
    from public.user_cards
    where owner_id = target_owner_id
    order by created_at asc
    limit 1;

    if next_user_card_id is not null then
      update public.user_cards
      set is_default = true
      where id = next_user_card_id
        and owner_id = target_owner_id;
    end if;
  end if;
end;
$$;
