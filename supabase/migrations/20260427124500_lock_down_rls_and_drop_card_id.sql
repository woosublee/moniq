drop policy if exists "allow anon select cards" on public.cards;
drop policy if exists "allow anon select user_cards" on public.user_cards;
drop policy if exists "allow anon insert user_cards" on public.user_cards;
drop policy if exists "allow anon update user_cards" on public.user_cards;
drop policy if exists "allow anon insert transactions" on public.transactions;
drop policy if exists "allow anon select transactions" on public.transactions;
drop policy if exists "allow anon update transactions" on public.transactions;
drop policy if exists "allow anon delete transactions" on public.transactions;

alter table public.transactions drop column if exists card_id;
