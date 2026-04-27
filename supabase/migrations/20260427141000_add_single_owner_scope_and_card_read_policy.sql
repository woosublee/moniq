alter table public.user_cards
  add column if not exists owner_id uuid not null default '00000000-0000-0000-0000-000000000001';

alter table public.transactions
  add column if not exists owner_id uuid not null default '00000000-0000-0000-0000-000000000001';

drop index if exists public.user_cards_card_id_unique;

create unique index if not exists user_cards_owner_id_card_id_unique
  on public.user_cards(owner_id, card_id);

create unique index if not exists user_cards_single_default_per_owner
  on public.user_cards(owner_id)
  where is_default;

create policy "allow anon select cards"
  on public.cards
  for select
  to anon
  using (true);
