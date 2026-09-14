create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.app_members enable row level security;

drop policy if exists "members can read own membership" on public.app_members;
create policy "members can read own membership"
  on public.app_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.app_members from public, anon, authenticated;
grant select on table public.app_members to authenticated;
grant select, insert, update, delete on table public.app_members to service_role;

revoke all on table public.user_cards from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
revoke all on table public.transaction_benefit_applications from anon, authenticated;
grant select, insert, update, delete on table public.user_cards to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.transaction_benefit_applications to authenticated;

drop policy if exists "allow authenticated select own user cards" on public.user_cards;
drop policy if exists "allow authenticated insert own user cards" on public.user_cards;
drop policy if exists "allow authenticated update own user cards" on public.user_cards;
drop policy if exists "allow authenticated delete own user cards" on public.user_cards;

create policy "active members select own user cards"
  on public.user_cards
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

create policy "active members insert own user cards"
  on public.user_cards
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

create policy "active members update own user cards"
  on public.user_cards
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

create policy "active members delete own user cards"
  on public.user_cards
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

drop policy if exists "allow authenticated select own transactions" on public.transactions;
drop policy if exists "allow authenticated insert own transactions" on public.transactions;
drop policy if exists "allow authenticated update own transactions" on public.transactions;
drop policy if exists "allow authenticated delete own transactions" on public.transactions;

create policy "active members select own transactions"
  on public.transactions
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

create policy "active members insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
    and (
      user_card_id is null
      or exists (
        select 1
        from public.user_cards
        where id = transactions.user_card_id
          and owner_id = (select auth.uid())
      )
    )
  );

create policy "active members update own transactions"
  on public.transactions
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
    and (
      user_card_id is null
      or exists (
        select 1
        from public.user_cards
        where id = transactions.user_card_id
          and owner_id = (select auth.uid())
      )
    )
  );

create policy "active members delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

drop policy if exists "allow authenticated select own transaction benefit applications" on public.transaction_benefit_applications;
drop policy if exists "allow authenticated insert own transaction benefit applications" on public.transaction_benefit_applications;
drop policy if exists "allow authenticated update own transaction benefit applications" on public.transaction_benefit_applications;
drop policy if exists "allow authenticated delete own transaction benefit applications" on public.transaction_benefit_applications;

create policy "active members select own transaction benefit applications"
  on public.transaction_benefit_applications
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

create policy "active members insert own transaction benefit applications"
  on public.transaction_benefit_applications
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
    and exists (
      select 1
      from public.transactions
      where id = transaction_benefit_applications.transaction_id
        and owner_id = (select auth.uid())
    )
    and (
      user_card_id is null
      or exists (
        select 1
        from public.user_cards
        where id = transaction_benefit_applications.user_card_id
          and owner_id = (select auth.uid())
      )
    )
  );

create policy "active members update own transaction benefit applications"
  on public.transaction_benefit_applications
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
    and exists (
      select 1
      from public.transactions
      where id = transaction_benefit_applications.transaction_id
        and owner_id = (select auth.uid())
    )
    and (
      user_card_id is null
      or exists (
        select 1
        from public.user_cards
        where id = transaction_benefit_applications.user_card_id
          and owner_id = (select auth.uid())
      )
    )
  );

create policy "active members delete own transaction benefit applications"
  on public.transaction_benefit_applications
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.app_members
      where user_id = (select auth.uid())
        and role = 'owner'
        and is_active
    )
  );

drop policy if exists "allow anon select cards" on public.cards;
create policy "read cards"
  on public.cards
  for select
  to anon, authenticated
  using (true);

drop policy if exists "allow anon select merchant rules" on public.merchant_rules;
create policy "read merchant rules"
  on public.merchant_rules
  for select
  to anon, authenticated
  using (true);

drop policy if exists "allow anon select card benefit rules" on public.card_benefit_rules;
create policy "read card benefit rules"
  on public.card_benefit_rules
  for select
  to anon, authenticated
  using (true);

drop policy if exists "allow anon select card performance requirements" on public.card_performance_requirements;
create policy "read card performance requirements"
  on public.card_performance_requirements
  for select
  to anon, authenticated
  using (true);

drop policy if exists "allow anon select card performance exclusion rules" on public.card_performance_exclusion_rules;
create policy "read card performance exclusion rules"
  on public.card_performance_exclusion_rules
  for select
  to anon, authenticated
  using (true);

revoke all on table public.cards from anon, authenticated;
revoke all on table public.merchant_rules from anon, authenticated;
revoke all on table public.card_benefit_rules from anon, authenticated;
revoke all on table public.card_performance_requirements from anon, authenticated;
revoke all on table public.card_performance_exclusion_rules from anon, authenticated;
grant select on table public.cards to anon, authenticated;
grant select on table public.merchant_rules to anon, authenticated;
grant select on table public.card_benefit_rules to anon, authenticated;
grant select on table public.card_performance_requirements to anon, authenticated;
grant select on table public.card_performance_exclusion_rules to anon, authenticated;

create or replace function public.set_default_user_card(
  target_owner_id uuid,
  target_user_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null
    or target_owner_id is distinct from caller_id
    or not exists (
      select 1
      from public.app_members
      where user_id = caller_id
        and role = 'owner'
        and is_active
    )
  then
    raise exception using errcode = '42501', message = 'access denied';
  end if;

  if not exists (
    select 1
    from public.user_cards
    where id = target_user_card_id
      and owner_id = caller_id
  ) then
    raise exception 'user card not found';
  end if;

  update public.user_cards
  set is_default = false
  where owner_id = caller_id
    and is_default = true;

  update public.user_cards
  set is_default = true
  where id = target_user_card_id
    and owner_id = caller_id;
end;
$$;

create or replace function public.delete_user_card_and_promote_default(
  target_owner_id uuid,
  target_user_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  was_default boolean;
  next_user_card_id uuid;
begin
  if caller_id is null
    or target_owner_id is distinct from caller_id
    or not exists (
      select 1
      from public.app_members
      where user_id = caller_id
        and role = 'owner'
        and is_active
    )
  then
    raise exception using errcode = '42501', message = 'access denied';
  end if;

  select is_default
    into was_default
  from public.user_cards
  where id = target_user_card_id
    and owner_id = caller_id
  for update;

  if was_default is null then
    raise exception 'user card not found';
  end if;

  delete from public.user_cards
  where id = target_user_card_id
    and owner_id = caller_id;

  if was_default then
    select id
      into next_user_card_id
    from public.user_cards
    where owner_id = caller_id
    order by created_at asc
    limit 1
    for update;

    if next_user_card_id is not null then
      update public.user_cards
      set is_default = true
      where id = next_user_card_id
        and owner_id = caller_id;
    end if;
  end if;
end;
$$;

revoke all on function public.set_default_user_card(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_user_card_and_promote_default(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_default_user_card(uuid, uuid) to authenticated;
grant execute on function public.delete_user_card_and_promote_default(uuid, uuid) to authenticated;
