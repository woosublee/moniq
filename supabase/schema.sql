create extension if not exists pgcrypto;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  name text not null,
  card_type text not null check (card_type in ('credit_card', 'check_card')),
  network text,
  annual_fee integer,
  image_url text,
  benefit_support_status text not null default 'none' check (benefit_support_status in ('full', 'partial', 'none')),
  benefit_summary text,
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
  merchant_normalized_name text,
  performance_exclusion_reason text,
  calculation_status text not null default 'no_matching_rule' check (
    calculation_status in ('calculated', 'unsupported_card', 'no_matching_rule', 'missing_performance', 'manual_override')
  ),
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

create index if not exists transactions_owner_user_card_occurred_at_idx
  on public.transactions(owner_id, user_card_id, occurred_at desc);

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

create index if not exists card_benefit_rules_card_id_active_idx
  on public.card_benefit_rules(card_id, is_active);

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

create index if not exists card_performance_requirements_card_id_active_idx
  on public.card_performance_requirements(card_id, is_active);

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

create index if not exists transaction_benefit_applications_transaction_id_idx
  on public.transaction_benefit_applications(transaction_id);

create index if not exists transaction_benefit_applications_owner_user_card_idx
  on public.transaction_benefit_applications(owner_id, user_card_id);

alter table public.cards enable row level security;
alter table public.user_cards enable row level security;
alter table public.transactions enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.card_benefit_rules enable row level security;
alter table public.card_performance_requirements enable row level security;
alter table public.card_performance_exclusion_rules enable row level security;
alter table public.transaction_benefit_applications enable row level security;

-- Fresh-schema access boundary (same as 20260913090000_private_access.sql).
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

-- Fresh-schema workspace models (same as 20260913093000_card_workspace_models.sql).
-- Model-only expansion. No owner reassignment, source-money rewrite, replay or command RPC.
-- Prerequisite: 20260913090000_private_access.sql. See the disposable SQL tests.
create extension if not exists btree_gist;

drop index if exists public.user_cards_owner_id_card_id_unique;
drop index if exists public.user_cards_card_id_unique;
alter table public.user_cards
  add column last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  add column issued_on date,
  add column tracking_started_on date,
  add column sort_order integer not null default 0,
  add column archived_at timestamptz,
  add column target_scope_key text,
  add column target_tier_key text,
  add constraint user_cards_target_pair check ((target_scope_key is null) = (target_tier_key is null)),
  add constraint user_cards_owner_instance_unique unique (owner_id, id);
-- id, not product or last_four, is the instance identity. Full PAN/CVC has no field.

create table public.card_rule_versions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete restrict,
  version_label text not null check (length(version_label) between 1 and 120),
  version_order integer not null check (version_order >= 0),
  source_url text check (source_url is null or source_url ~ '^https://[^[:space:]]+$'),
  effective_from date,
  effective_until date,
  checked_on date,
  verification_status text not null check (verification_status in ('verified', 'unverified', 'legacy_unverified')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published')),
  policy_json jsonb,
  legacy_snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (card_id, version_order),
  unique (card_id, version_label),
  check (effective_until is null or (effective_from is not null and effective_until > effective_from)),
  check (policy_json is null or (jsonb_typeof(policy_json) = 'object' and coalesce(policy_json->'schemaVersion' = '1'::jsonb, false))),
  check (legacy_snapshot is null or jsonb_typeof(legacy_snapshot) = 'object'),
  check (verification_status <> 'legacy_unverified' or (policy_json is null and legacy_snapshot is not null)),
  check (publication_status <> 'published' or (
    verification_status = 'verified' and version_order > 0 and source_url is not null
    and effective_from is not null and checked_on is not null and policy_json is not null and published_at is not null
  ))
);
comment on column public.card_rule_versions.policy_json is 'Trusted admin must validate with cardPolicySchema (strict Zod v1) before publication. Legacy snapshots are never executable policies.';
comment on table public.card_rule_versions is 'Published rows immutable. Select verified published rows with effective_from <= Seoul purchase date < effective_until (NULL=infinity), highest version_order wins overlaps. Corrections insert a higher order; old intervals are not rewritten.';

create function public.guard_card_rule_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.publication_status = 'published' then
    raise exception using errcode = '23514', message = 'published rule versions are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.publication_status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end;
$$;
create trigger guard_card_rule_version before insert or update or delete on public.card_rule_versions
  for each row execute function public.guard_card_rule_version();
revoke all on function public.guard_card_rule_version() from public, anon, authenticated;

-- Snapshot existing rule seed verbatim. No legacy row is changed or called verified.
insert into public.card_rule_versions (card_id, version_label, version_order, verification_status, legacy_snapshot)
select c.id, 'legacy', 0, 'legacy_unverified', jsonb_build_object(
  'benefit_rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.card_benefit_rules r where r.card_id = c.id), '[]'::jsonb),
  'performance_requirements', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.card_performance_requirements r where r.card_id = c.id), '[]'::jsonb),
  'performance_exclusions', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.card_performance_exclusion_rules r where r.card_id = c.id), '[]'::jsonb)
)
from public.cards c
where exists (select 1 from public.card_benefit_rules r where r.card_id = c.id)
   or exists (select 1 from public.card_performance_requirements r where r.card_id = c.id)
   or exists (select 1 from public.card_performance_exclusion_rules r where r.card_id = c.id);

create table public.card_scope_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  target_user_card_id uuid not null,
  contributor_user_card_id uuid not null,
  rule_version_id uuid not null references public.card_rule_versions(id) on delete restrict,
  scope_kind text not null check (scope_kind in ('performance', 'quota')),
  scope_key text not null check (scope_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  contributor_slot text not null check (contributor_slot ~ '^[a-z][a-z0-9_-]{0,63}$' and contributor_slot <> 'self'),
  scope_instance_key text not null check (length(scope_instance_key) between 1 and 160),
  valid_from_month date not null check (extract(day from valid_from_month) = 1 and valid_from_month between date '0001-01-01' and date '9999-12-01'),
  valid_until_month date check (valid_until_month is null or (extract(day from valid_until_month) = 1 and valid_until_month between date '0001-01-01' and date '9999-12-01')),
  version bigint not null default 1 check (version > 0),
  foreign key (owner_id, target_user_card_id) references public.user_cards(owner_id, id) on delete restrict,
  foreign key (owner_id, contributor_user_card_id) references public.user_cards(owner_id, id) on delete restrict,
  check (target_user_card_id <> contributor_user_card_id),
  check (valid_until_month is null or valid_until_month > valid_from_month),
  exclude using gist (owner_id with =, target_user_card_id with =, rule_version_id with =, scope_kind with =, scope_key with =, contributor_slot with =, daterange(valid_from_month, valid_until_month, '[)') with &&)
);
comment on table public.card_scope_memberships is 'Directed, owner-local target->contributor bindings. self implicit. No transitive closure/symmetric expansion. Scope instance identifies exact aggregate: independent quota and performance target-local, shared quota pool owner-local. Task 4 must validate coherent instance keys and shared cap definitions for each selected month.';

create function public.guard_card_scope_membership() returns trigger
language plpgsql set search_path = '' as $$
declare
  rule public.card_rule_versions;
  scope jsonb;
begin
  select * into rule from public.card_rule_versions where id = new.rule_version_id;
  if not found or rule.publication_status <> 'published' or rule.verification_status <> 'verified'
    or not exists (select 1 from public.user_cards c where c.id = new.target_user_card_id and c.card_id = rule.card_id)
  then raise exception using errcode = '23514', message = 'binding requires published policy for target product'; end if;
  if new.scope_kind = 'performance' then
    select item into scope from jsonb_array_elements(rule.policy_json->'performanceScopes') item where item->>'key' = new.scope_key;
    if scope is null or not coalesce(scope->'contributorSlots' ? new.contributor_slot, false) then
      raise exception using errcode = '23514', message = 'unknown performance contributor slot';
    end if;
  else
    select item into scope from jsonb_array_elements(rule.policy_json->'quotas') item where item->>'key' = new.scope_key;
    if scope is null or (scope->'sharing'->>'kind') is distinct from 'shared' or not coalesce(scope->'sharing'->'contributorSlots' ? new.contributor_slot, false) then
      raise exception using errcode = '23514', message = 'unknown shared quota contributor slot';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_card_scope_membership before insert or update on public.card_scope_memberships
  for each row execute function public.guard_card_scope_membership();
revoke all on function public.guard_card_scope_membership() from public, anon, authenticated;

create table public.card_month_inputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  month date not null check (extract(day from month) = 1 and month between date '0001-01-01' and date '9999-12-01'),
  scope_instance_key text not null check (length(scope_instance_key) between 1 and 160),
  scope_kind text not null check (scope_kind in ('performance', 'quota')),
  scope_key text not null check (scope_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  data_status text not null,
  amount numeric,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (owner_id, month, scope_kind, scope_instance_key, scope_key),
  check ((scope_kind = 'performance' and data_status in ('manual_total', 'complete', 'incomplete', 'before_tracking_unknown'))
      or (scope_kind = 'quota' and data_status in ('complete', 'unknown', 'remaining'))),
  check ((data_status in ('manual_total', 'remaining') and amount is not null and amount between 0 and 9007199254740991 and amount = trunc(amount))
      or (data_status not in ('manual_total', 'remaining') and amount is null))
);
comment on table public.card_month_inputs is 'manual_total replaces only this exact scope/month (never add to ledger sum). remaining is opening monthly quota before tracked transactions; complete means all monthly usage is recorded. Quota completeness is independent of performance totals.';

create sequence public.ledger_stable_sequence as bigint;
-- Relax old numeric precision without rounding or converting any existing value.
alter table public.transactions
  alter column amount type numeric,
  alter column actual_amount type numeric,
  alter column benefit_amount type numeric,
  alter column final_amount type numeric,
  alter column eligible_spend_amount type numeric,
  add column origin text not null default 'legacy' check (origin in ('new', 'legacy')),
  add column version bigint not null default 1 check (version > 0),
  add column stable_sequence bigint not null default nextval('public.ledger_stable_sequence') unique,
  add column payment_channel text not null default 'unknown' check (payment_channel in ('offline', 'online', 'mobile_wallet', 'unknown')),
  add column installment_months integer check (installment_months is null or installment_months between 1 and 60),
  add column input_excluded boolean not null default false,
  add column legacy_review_required boolean not null default true,
  add constraint transactions_owner_instance_unique unique (owner_id, id),
  add constraint transactions_new_won check (origin <> 'new' or (
    amount between 1 and 9007199254740991 and amount = trunc(amount)
    and actual_amount between 1 and 9007199254740991 and actual_amount = trunc(actual_amount)
  ));
-- Old UI continues writing legacy until command RPC explicitly opts into 'new'.
-- NOT VALID preserves any pre-existing inconsistent links for review; new writes enforce owner.
alter table public.transactions add constraint transactions_owned_card
  foreign key (owner_id, user_card_id) references public.user_cards(owner_id, id) not valid;

create table public.transaction_adjustments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  transaction_id uuid not null,
  kind text not null default 'refund' check (kind = 'refund'),
  occurred_at timestamptz not null,
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  origin text not null default 'new' check (origin in ('new', 'legacy')),
  version bigint not null default 1 check (version > 0),
  stable_sequence bigint not null default nextval('public.ledger_stable_sequence') unique,
  memo text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (owner_id, transaction_id) references public.transactions(owner_id, id) on delete restrict,
  check (origin <> 'new' or (amount <= 9007199254740991 and amount = trunc(amount)))
);
comment on table public.transaction_adjustments is 'Positive refunds linked to original source, no negative purchase rows. Task 4 validates cumulative active refunds <= original amount while holding owner revision lock.';

create table public.transaction_annotations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  transaction_id uuid not null,
  target_kind text not null check (target_kind in ('performance', 'benefit_eligible', 'confirmed_benefit')),
  target_key text,
  scope_instance_key text check (scope_instance_key is null or length(scope_instance_key) between 1 and 160),
  amount numeric not null check (amount >= 0 and amount < 'Infinity'::numeric),
  origin text not null default 'manual' check (origin in ('manual', 'legacy_manual')),
  review_status text not null default 'resolved' check (review_status in ('resolved', 'needs_review')),
  basis_auto_amount numeric,
  basis_input_revision bigint check (basis_input_revision is null or basis_input_revision >= 0),
  basis_rule_version_id uuid references public.card_rule_versions(id) on delete restrict,
  legacy_application_id uuid,
  legacy_snapshot jsonb,
  version bigint not null default 1 check (version > 0),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (owner_id, transaction_id) references public.transactions(owner_id, id) on delete restrict,
  check (target_key is null or target_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  check (review_status <> 'resolved' or (target_key is not null and (target_kind <> 'performance' or scope_instance_key is not null))),
  check (target_kind = 'performance' or scope_instance_key is null),
  check (origin <> 'manual' or (amount <= 9007199254740991 and amount = trunc(amount) and basis_input_revision is not null)),
  check (legacy_snapshot is null or jsonb_typeof(legacy_snapshot) = 'object')
);
create unique index transaction_annotations_current_target on public.transaction_annotations (owner_id, transaction_id, target_kind, target_key, coalesce(scope_instance_key, '')) where voided_at is null and review_status = 'resolved';
create unique index transaction_annotations_legacy_application on public.transaction_annotations (legacy_application_id, target_kind) where legacy_application_id is not null;
comment on table public.transaction_annotations is 'Only amount is a deliberate override. basis_auto_amount/input_revision/rule_version_id are audit evidence NEVER replay inputs. unresolved legacy target is retained but not applied until reviewed. legacy_application_id is historical identity, not a cascading FK.';

-- Explicit manual applications are known intent; unresolved target mapping stays review-only.
-- Ambiguous transaction amounts are not converted into fabricated overrides.
insert into public.transaction_annotations (owner_id, transaction_id, target_kind, amount, origin, review_status, legacy_application_id, legacy_snapshot)
select a.owner_id, a.transaction_id, v.target_kind, v.amount, 'legacy_manual', 'needs_review', a.id, to_jsonb(a)
from public.transaction_benefit_applications a
join public.transactions t on t.id = a.transaction_id and t.owner_id = a.owner_id
cross join lateral (values ('confirmed_benefit', a.benefit_amount), ('performance', a.eligible_spend_amount)) v(target_kind, amount)
where a.source in ('manual', 'legacy_manual');

create function public.guard_ledger_source_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.stable_sequence := nextval('public.ledger_stable_sequence');
    return new;
  end if;
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
    or new.stable_sequence is distinct from old.stable_sequence or new.origin is distinct from old.origin
  then raise exception using errcode = '23514', message = 'source identity and sequence are immutable'; end if;
  return new;
end;
$$;
create trigger guard_transaction_identity before insert or update on public.transactions for each row execute function public.guard_ledger_source_identity();
create trigger guard_adjustment_identity before insert or update on public.transaction_adjustments for each row execute function public.guard_ledger_source_identity();
-- Existing rows got sequences once above. Future inserts are assigned by the trigger,
-- so a caller-supplied value cannot forge ordering (and defaults do not double-increment).
alter table public.transactions alter column stable_sequence drop default;
alter table public.transaction_adjustments alter column stable_sequence drop default;
revoke all on function public.guard_ledger_source_identity() from public, anon, authenticated;

create table public.owner_ledger_revisions (
  owner_id uuid primary key,
  revision bigint not null default 0 check (revision >= 0)
);
-- Preserve historical owners, including local legacy owners without an auth account.
insert into public.owner_ledger_revisions (owner_id)
select owner_id from public.user_cards union select owner_id from public.transactions;

create table public.ledger_mutation_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owner_ledger_revisions(owner_id) on delete restrict,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  owner_revision bigint not null check (owner_revision > 0),
  mutation_kind text not null check (length(mutation_kind) between 1 and 80),
  before_source jsonb check (before_source is null or jsonb_typeof(before_source) = 'object'),
  after_source jsonb check (after_source is null or jsonb_typeof(after_source) = 'object'),
  result_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique (owner_id, request_id),
  unique (owner_id, owner_revision),
  check (before_source is not null or after_source is not null)
);
comment on table public.ledger_mutation_log is 'Task 4 command atomically locks owner revision, checks request UUID+canonical SHA256, changes originals, increments revision and appends before/after sources plus result IDs. JSON money/revisions must be encoded as decimal text for lossless transport. No replay outputs are source data.';
create function public.guard_ledger_mutation_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'ledger mutation log is append only';
end;
$$;
create trigger guard_ledger_mutation_log before update or delete on public.ledger_mutation_log for each row execute function public.guard_ledger_mutation_log();
revoke all on function public.guard_ledger_mutation_log() from public, anon, authenticated;

-- New model writes are command/admin-only; ordinary clients SELECT only. No new RPC here.
do $$
declare table_name text;
begin
  foreach table_name in array array['card_scope_memberships', 'card_month_inputs', 'transaction_adjustments', 'transaction_annotations', 'owner_ledger_revisions', 'ledger_mutation_log'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('create policy "active members select own workspace rows" on public.%I for select to authenticated using (owner_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()) and role = ''owner'' and is_active))', table_name);
  end loop;
end;
$$;
alter table public.card_rule_versions enable row level security;
revoke all on table public.card_rule_versions from public, anon, authenticated;
grant select on table public.card_rule_versions to authenticated;
grant select, insert, update, delete on table public.card_rule_versions to service_role;
create policy "active members select published rule versions" on public.card_rule_versions for select to authenticated
  using (publication_status = 'published' and exists (select 1 from public.app_members where user_id = (select auth.uid()) and role = 'owner' and is_active));
revoke all on sequence public.ledger_stable_sequence from public, anon, authenticated;
-- Existing authorized transaction INSERTs still need sequence usage during compatibility phase.
grant usage on sequence public.ledger_stable_sequence to authenticated, service_role;
create index card_scope_memberships_owner_target on public.card_scope_memberships(owner_id, target_user_card_id, valid_from_month);
create index transaction_adjustments_owner_original on public.transaction_adjustments(owner_id, transaction_id, occurred_at, stable_sequence);
create index transaction_annotations_owner_original on public.transaction_annotations(owner_id, transaction_id);

-- Task4 atomic ledger commands (same installation as 20260913100000_ledger_commands.sql).
-- Atomic source commands and a single MVCC input snapshot; no stored projection.
alter table public.user_cards add column version bigint not null default 1 check (version > 0);

-- Internal writers are never callable by API roles; pure read helpers are granted below.
-- Opaque history JSON must also survive JavaScript transport without rounding.
-- Only called for legacy/calculation snapshots; executable policy_json is untouched.
create function public.ledger_decimal_json(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  case jsonb_typeof(value)
    when 'number' then return to_jsonb(value #>> '{}');
    when 'object' then return coalesce((select jsonb_object_agg(key,public.ledger_decimal_json(val)) from jsonb_each(value) e(key,val)),'{}'::jsonb);
    when 'array' then return coalesce((select jsonb_agg(public.ledger_decimal_json(val) order by ord) from jsonb_array_elements(value) with ordinality e(val,ord)),'[]'::jsonb);
    else return value;
  end case;
end
$$;
create function public.ledger_source_json(value jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, case
    when key = any(array['amount','actual_amount','benefit_amount','final_amount','eligible_spend_amount','basis_auto_amount','version','stable_sequence','revision','owner_revision','basis_input_revision']) and jsonb_typeof(val) = 'number'
      then to_jsonb(val #>> '{}')
    when key in ('legacy_snapshot','calculation_snapshot') then public.ledger_decimal_json(val) else val end), '{}'::jsonb)
  from jsonb_each(value) pair(key,val)
$$;
create function public.ledger_assert_keys(value jsonb, allowed text[], required text[] default '{}') returns void
language plpgsql set search_path = '' as $$
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or exists(select 1 from jsonb_object_keys(value) k where not k = any(allowed))
    or not value ?& required then
    raise exception using errcode='22023', message='invalid command fields';
  end if;
end
$$;
create function public.ledger_won(value jsonb, minimum numeric default 0) returns numeric
language plpgsql immutable set search_path = '' as $$
declare amount numeric;
begin
  if value is null or jsonb_typeof(value) <> 'number' then
    raise exception using errcode='22023',message='new KRW requires a JSON integer';
  end if;
  amount := (value #>> '{}')::numeric;
  if not (amount between minimum and 9007199254740991 and amount = trunc(amount)) then
    raise exception using errcode='22023',message='new KRW out of safe integer range';
  end if;
  return amount;
end
$$;
create function public.ledger_version(value jsonb) returns bigint
language plpgsql immutable set search_path = '' as $$
begin
  if value is null or jsonb_typeof(value) not in ('string','number') or (value #>> '{}') !~ '^(0|[1-9][0-9]*)$'
    or (jsonb_typeof(value)='number' and (value #>> '{}')::numeric > 9007199254740991) then
    raise exception using errcode='22023',message='invalid version';
  end if;
  return (value #>> '{}')::bigint;
end
$$;
create function public.ledger_month(value text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if value is null or value !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or left(value,4)='0000' then
    raise exception using errcode='22023',message='invalid ledger month';
  end if;
  return (value || '-01')::date;
end
$$;
create function public.ledger_validate_fields(value jsonb) returns void
language plpgsql set search_path = '' as $$
declare k text; v jsonb; typ text;
begin
  -- Types for the finite source vocabulary. Enum/range/reference checks follow per command.
  for k,v in select key,val from jsonb_each(value) e(key,val) loop
    typ := jsonb_typeof(v);
    if k = any(array['amount','basis_auto_amount']) then
      if k <> 'basis_auto_amount' or typ <> 'null' then perform public.ledger_won(v); end if;
    elsif k = 'basis_input_revision' then
      perform public.ledger_version(v);
    elsif k = any(array['is_fixed_cost']) then
      if typ <> 'boolean' then raise exception using errcode='22023',message='invalid boolean'; end if;
    elsif k = any(array['installment_months','sort_order']) then
      if not (k='installment_months' and typ='null') and (typ<>'number' or (v #>> '{}') !~ '^-?[0-9]+$') then
        raise exception using errcode='22023',message='invalid integer field';
      end if;
    elsif k = any(array['user_card_id','card_id','transaction_id','target_user_card_id','contributor_user_card_id','rule_version_id','basis_rule_version_id']) then
      if not (k=any(array['user_card_id','basis_rule_version_id']) and typ='null') then
        if typ<>'string' then raise exception using errcode='22023',message='invalid reference'; end if;
        perform (v #>> '{}')::uuid;
      end if;
    elsif k='occurred_at' then
      if typ<>'string' or (v #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        or ((v #>> '{}')::timestamptz at time zone 'Asia/Seoul')::date not between date '0001-01-01' and date '9999-12-31' then
        raise exception using errcode='22023',message='invalid occurred_at';
      end if;
    elsif k=any(array['issued_on','tracking_started_on']) then
      if typ<>'null' and (typ<>'string' or (v #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (v #>> '{}')::date not between date '0001-01-01' and date '9999-12-31') then
        raise exception using errcode='22023',message='invalid source date';
      end if;
    elsif typ <> 'string' and not (typ='null' and k=any(array['memo','alias','last_four','ledger_category','target_scope_key','target_tier_key','scope_instance_key','valid_until_month'])) then
      raise exception using errcode='22023',message='invalid source field type';
    end if;
    if k=any(array['memo','alias','merchant_name','ledger_category']) and typ='string'
      and length(v #>> '{}') > case k when 'memo' then 2000 when 'alias' then 100 when 'merchant_name' then 200 else 120 end then
      raise exception using errcode='22023',message='source text too long';
    end if;
  end loop;
end
$$;

-- Read-only structural checks. This deliberately does not calculate tiers or rewards.
create function public.ledger_validate_bindings(owner uuid) returns void
language plpgsql set search_path = '' as $$
declare a record; b record; qa jsonb; qb jsonb; members_a uuid[]; members_b uuid[]; at_month date;
begin
  for a in select m.*,r.policy_json,r.effective_from,r.effective_until from public.card_scope_memberships m join public.card_rule_versions r on r.id=m.rule_version_id where m.owner_id=owner loop
    if a.valid_from_month < date_trunc('month',a.effective_from)::date
      or (a.effective_until is not null and (a.valid_until_month is null or a.valid_until_month > date_trunc('month',a.effective_until - 1)::date + interval '1 month')) then
      raise exception using errcode='23514',message='binding outside rule coverage';
    end if;
    if a.scope_instance_key like 'card:%' and a.scope_instance_key<>'card:'||a.target_user_card_id||':'||a.scope_kind||':'||a.scope_key then
      raise exception using errcode='23514',message='reserved implicit instance belongs to another target';
    end if;
    for b in select m.*,r.policy_json from public.card_scope_memberships m join public.card_rule_versions r on r.id=m.rule_version_id
      where m.owner_id=owner and m.id<>a.id and m.scope_kind=a.scope_kind and m.scope_key=a.scope_key
        and daterange(m.valid_from_month,m.valid_until_month,'[)') && daterange(a.valid_from_month,a.valid_until_month,'[)') loop
      if a.target_user_card_id=b.target_user_card_id and a.rule_version_id=b.rule_version_id and a.scope_instance_key<>b.scope_instance_key then
        raise exception using errcode='23514',message='conflicting scope instances';
      end if;
      if a.scope_instance_key<>b.scope_instance_key then continue; end if;
      if a.scope_kind='performance' then
        if a.target_user_card_id<>b.target_user_card_id then raise exception using errcode='23514',message='performance scope must be target-local'; end if;
        continue;
      end if;
      select q into qa from jsonb_array_elements(a.policy_json->'quotas') q where q->>'key'=a.scope_key;
      select q into qb from jsonb_array_elements(b.policy_json->'quotas') q where q->>'key'=b.scope_key;
      -- Tier array order is not cap meaning (same canonicalization as TS).
      if qa->'limit'->>'kind'='tiered' then
        qa:=jsonb_set(qa,'{limit,amounts}',(select jsonb_agg(v order by v->>'tierKey') from jsonb_array_elements(qa->'limit'->'amounts') v));
      end if;
      if qb->'limit'->>'kind'='tiered' then
        qb:=jsonb_set(qb,'{limit,amounts}',(select jsonb_agg(v order by v->>'tierKey') from jsonb_array_elements(qb->'limit'->'amounts') v));
      end if;
      if coalesce(qa->>'period','monthly')<>coalesce(qb->>'period','monthly')
        or coalesce(qa->'consumption','{"kind":"benefit_amount","unit":{"kind":"won"}}')<>coalesce(qb->'consumption','{"kind":"benefit_amount","unit":{"kind":"won"}}')
        or qa->'sharing'->>'kind' is distinct from qb->'sharing'->>'kind'
        or qa->'limit' is distinct from qb->'limit' then
        raise exception using errcode='23514',message='incompatible stable quota definitions';
      end if;
      at_month := greatest(a.valid_from_month,b.valid_from_month);
      select array_agg(distinct contributor order by contributor) into members_a from (
        select a.target_user_card_id contributor union select m.contributor_user_card_id from public.card_scope_memberships m
        where m.owner_id=owner and m.target_user_card_id=a.target_user_card_id and m.rule_version_id=a.rule_version_id and m.scope_kind=a.scope_kind and m.scope_key=a.scope_key
          and m.valid_from_month<=at_month and (m.valid_until_month is null or at_month<m.valid_until_month)) s;
      select array_agg(distinct contributor order by contributor) into members_b from (
        select b.target_user_card_id contributor union select m.contributor_user_card_id from public.card_scope_memberships m
        where m.owner_id=owner and m.target_user_card_id=b.target_user_card_id and m.rule_version_id=b.rule_version_id and m.scope_kind=b.scope_kind and m.scope_key=b.scope_key
          and m.valid_from_month<=at_month and (m.valid_until_month is null or at_month<m.valid_until_month)) s;
      if members_a<>members_b then raise exception using errcode='23514',message='shared quota contributors must agree'; end if;
    end loop;
  end loop;
end
$$;

create function public.ledger_apply_entry(owner uuid, input_revision bigint, command jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  kind text := command->>'kind'; entry_id uuid; table_name text; is_create boolean;
  source jsonb; before_row jsonb; after_row jsonb; changes jsonb := '[]'; other record;
  t public.transactions; a public.transaction_adjustments; n public.transaction_annotations;
  c public.user_cards; m public.card_scope_memberships; d public.card_month_inputs;
  expected bigint; fields text[]; original public.transactions; rule public.card_rule_versions; scope jsonb; month date;
begin
  if kind = any(array['transaction.create','refund.create','annotation.create','card.create','month_input.create','membership.create']) then
    perform public.ledger_assert_keys(command,array['kind','id','source'],array['kind','id','source']); is_create:=true;
  elsif kind = any(array['transaction.update','card.update']) then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version','patch'],array['kind','id','expected_version','patch']); is_create:=false;
  elsif kind='transaction.exclude' then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version','excluded'],array['kind','id','expected_version','excluded']); is_create:=false;
    if jsonb_typeof(command->'excluded')<>'boolean' then raise exception using errcode='22023',message='invalid exclusion flag'; end if;
  elsif kind = any(array['refund.update','annotation.update','month_input.update','membership.update']) then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version','source'],array['kind','id','expected_version','source']); is_create:=false;
  elsif kind = any(array['refund.void','annotation.void','card.default','card.archive','membership.remove']) then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version'],array['kind','id','expected_version']); is_create:=false;
  else raise exception using errcode='22023',message='unknown ledger command'; end if;
  if jsonb_typeof(command->'id')<>'string' then raise exception using errcode='22023',message='invalid entry ID'; end if;
  entry_id := (command->>'id')::uuid;
  table_name := case split_part(kind,'.',1) when 'transaction' then 'transactions' when 'refund' then 'transaction_adjustments' when 'annotation' then 'transaction_annotations' when 'card' then 'user_cards' when 'month_input' then 'card_month_inputs' when 'membership' then 'card_scope_memberships' end;
  -- Identifier is selected solely from the finite mapping above, never from user input.
  if not is_create then
    expected := public.ledger_version(command->'expected_version');
    execute format('select to_jsonb(r) from public.%I r where owner_id=$1 and id=$2',table_name) into before_row using owner,entry_id;
    if before_row is null then raise exception using errcode='42501',message='entry unavailable'; end if;
    if expected<1 or expected<>(before_row->>'version')::bigint then raise exception using errcode='40001',message='stale entry version'; end if;
  end if;
  source := coalesce(command->'source',command->'patch');

  if kind like 'transaction.%' then
    if kind<>'transaction.exclude' then
      fields:=array['occurred_at','merchant_name','amount','payment_method','user_card_id','payment_channel','installment_months','ledger_category','is_fixed_cost','memo'];
      perform public.ledger_assert_keys(source,fields,case when is_create then fields else '{}'::text[] end);
      if source='{}'::jsonb then raise exception using errcode='22023',message='empty patch'; end if;
      perform public.ledger_validate_fields(source);
      if source ? 'amount' then perform public.ledger_won(source->'amount',1); end if;
      select * into t from jsonb_populate_record(null::public.transactions,coalesce(before_row,'{}') || source);
      if length(btrim(t.merchant_name))=0 then raise exception using errcode='22023',message='merchant is required'; end if;
      if t.payment_method in ('credit_card','check_card') then
        if not exists(select 1 from public.user_cards u join public.cards p on p.id=u.card_id where u.id=t.user_card_id and u.owner_id=owner and p.card_type=t.payment_method and (u.archived_at is null or (not is_create and t.user_card_id=(before_row->>'user_card_id')::uuid))) then
          raise exception using errcode='42501',message='payment card unavailable';
        end if;
      elsif t.user_card_id is not null then raise exception using errcode='22023',message='non-card payment cannot reference a card'; end if;
      if is_create then
        insert into public.transactions(id,owner_id,occurred_at,merchant_name,amount,actual_amount,benefit_amount,final_amount,eligible_spend_amount,is_performance_eligible,payment_method,user_card_id,payment_channel,installment_months,ledger_category,is_fixed_cost,memo,origin,legacy_review_required)
        values(entry_id,owner,t.occurred_at,btrim(t.merchant_name),t.amount,t.amount,0,t.amount,0,false,t.payment_method,t.user_card_id,t.payment_channel,t.installment_months,t.ledger_category,t.is_fixed_cost,t.memo,'new',false);
      else
        update public.transactions set occurred_at=t.occurred_at,merchant_name=btrim(t.merchant_name),amount=t.amount,
          actual_amount=case when source ? 'amount' then t.amount else actual_amount end,
          payment_method=t.payment_method,user_card_id=t.user_card_id,payment_channel=t.payment_channel,installment_months=t.installment_months,ledger_category=t.ledger_category,is_fixed_cost=t.is_fixed_cost,memo=t.memo,version=version+1
          where owner_id=owner and id=entry_id;
      end if;
    else
      update public.transactions set input_excluded=(command->>'excluded')::boolean,version=version+1 where owner_id=owner and id=entry_id;
    end if;
  elsif kind like 'refund.%' then
    if kind='refund.void' then
      update public.transaction_adjustments set voided_at=coalesce(voided_at,now()),version=version+1 where owner_id=owner and id=entry_id;
    else
      fields:=array['transaction_id','occurred_at','amount','memo'];
      perform public.ledger_assert_keys(source,fields,fields); perform public.ledger_validate_fields(source); perform public.ledger_won(source->'amount',1);
      select * into a from jsonb_populate_record(null::public.transaction_adjustments,source);
      select * into original from public.transactions where owner_id=owner and id=a.transaction_id;
      if not found then raise exception using errcode='42501',message='original transaction unavailable'; end if;
      if a.occurred_at < original.occurred_at then raise exception using errcode='23514',message='refund precedes original'; end if;
      if not is_create and (before_row->>'transaction_id')::uuid<>a.transaction_id then raise exception using errcode='23514',message='refund original is immutable'; end if;
      if is_create then
        insert into public.transaction_adjustments(id,owner_id,transaction_id,occurred_at,amount,memo) values(entry_id,owner,a.transaction_id,a.occurred_at,a.amount,a.memo);
      else
        if before_row->>'voided_at' is not null then raise exception using errcode='23514',message='voided refund cannot be edited'; end if;
        update public.transaction_adjustments set occurred_at=a.occurred_at,amount=a.amount,memo=a.memo,version=version+1 where owner_id=owner and id=entry_id;
      end if;
    end if;
  elsif kind like 'annotation.%' then
    if kind='annotation.void' then
      update public.transaction_annotations set voided_at=coalesce(voided_at,now()),version=version+1 where owner_id=owner and id=entry_id;
    else
      fields:=array['transaction_id','target_kind','target_key','scope_instance_key','amount','basis_auto_amount','basis_input_revision','basis_rule_version_id'];
      perform public.ledger_assert_keys(source,fields,fields); perform public.ledger_validate_fields(source);
      if public.ledger_version(source->'basis_input_revision')<>input_revision then raise exception using errcode='40001',message='stale annotation basis revision'; end if;
      select * into n from jsonb_populate_record(null::public.transaction_annotations,source);
      select * into original from public.transactions where owner_id=owner and id=n.transaction_id;
      if not found then raise exception using errcode='42501',message='original transaction unavailable'; end if;
      if not is_create and ((before_row->>'transaction_id')::uuid<>n.transaction_id or before_row->>'voided_at' is not null) then raise exception using errcode='23514',message='annotation original is immutable or voided'; end if;
      month:=date_trunc('month',original.occurred_at at time zone 'Asia/Seoul')::date;
      select * into rule from public.card_rule_versions where id=n.basis_rule_version_id and publication_status='published' and verification_status='verified';
      if not found then raise exception using errcode='23514',message='annotation needs verified target rule'; end if;
      if n.target_kind='performance' then
        if not exists(select 1 from public.user_cards u cross join lateral jsonb_array_elements(rule.policy_json->'performanceScopes') s
          where u.owner_id=owner and u.card_id=rule.card_id and s->>'key'=n.target_key
            and coalesce((select m.scope_instance_key from public.card_scope_memberships m where m.owner_id=owner and m.target_user_card_id=u.id and m.rule_version_id=rule.id and m.scope_kind='performance' and m.scope_key=n.target_key and m.valid_from_month<=month and (m.valid_until_month is null or month<m.valid_until_month) order by m.id limit 1),'card:'||u.id||':performance:'||n.target_key)=n.scope_instance_key
            and (u.id=original.user_card_id or exists(select 1 from public.card_scope_memberships m where m.owner_id=owner and m.target_user_card_id=u.id and m.contributor_user_card_id=original.user_card_id and m.rule_version_id=rule.id and m.scope_kind='performance' and m.scope_key=n.target_key and m.valid_from_month<=month and (m.valid_until_month is null or month<m.valid_until_month)))) then
          raise exception using errcode='23514',message='annotation scope is not a direct contributor target';
        end if;
      elsif n.target_kind in ('benefit_eligible','confirmed_benefit') then
        if not exists(select 1 from public.user_cards u cross join lateral jsonb_array_elements(rule.policy_json->'benefits') b where u.id=original.user_card_id and u.owner_id=owner and u.card_id=rule.card_id and b->>'key'=n.target_key) then
          raise exception using errcode='23514',message='annotation benefit target unavailable';
        end if;
      else raise exception using errcode='22023',message='unknown annotation target'; end if;
      if not (rule.effective_from<=(original.occurred_at at time zone 'Asia/Seoul')::date and (rule.effective_until is null or (original.occurred_at at time zone 'Asia/Seoul')::date<rule.effective_until))
        or exists(select 1 from public.card_rule_versions r where r.card_id=rule.card_id and r.publication_status='published' and r.verification_status='verified' and r.version_order>rule.version_order and r.effective_from<=(original.occurred_at at time zone 'Asia/Seoul')::date and (r.effective_until is null or (original.occurred_at at time zone 'Asia/Seoul')::date<r.effective_until)) then
        raise exception using errcode='40001',message='annotation rule is not current for source day';
      end if;
      if is_create then
        insert into public.transaction_annotations(id,owner_id,transaction_id,target_kind,target_key,scope_instance_key,amount,basis_auto_amount,basis_input_revision,basis_rule_version_id)
        values(entry_id,owner,n.transaction_id,n.target_kind,n.target_key,n.scope_instance_key,n.amount,n.basis_auto_amount,n.basis_input_revision,n.basis_rule_version_id);
      else
        update public.transaction_annotations set target_kind=n.target_kind,target_key=n.target_key,scope_instance_key=n.scope_instance_key,amount=n.amount,basis_auto_amount=n.basis_auto_amount,basis_input_revision=n.basis_input_revision,basis_rule_version_id=n.basis_rule_version_id,review_status='resolved',version=version+1 where owner_id=owner and id=entry_id;
      end if;
    end if;
  elsif kind like 'card.%' then
    if kind in ('card.create','card.update') then
      fields:=case when is_create then array['card_id','alias','last_four','issued_on','tracking_started_on'] else array['alias','last_four','issued_on','tracking_started_on','sort_order','target_scope_key','target_tier_key'] end;
      perform public.ledger_assert_keys(source,fields,case when is_create then array['card_id','alias'] else '{}'::text[] end); perform public.ledger_validate_fields(source);
      if source='{}'::jsonb then raise exception using errcode='22023',message='empty patch'; end if;
      select * into c from jsonb_populate_record(null::public.user_cards,coalesce(before_row,'{}')||source);
      if c.target_scope_key is not null and not exists (
        select 1 from public.card_rule_versions r cross join lateral jsonb_array_elements(r.policy_json->'performanceScopes') s
        cross join lateral jsonb_array_elements(s->'tiers') tier
        where r.card_id=c.card_id and r.publication_status='published' and r.verification_status='verified'
          and s->>'key'=c.target_scope_key and tier->>'key'=c.target_tier_key
      ) then raise exception using errcode='23514',message='target performance tier unavailable'; end if;
      if is_create then
        insert into public.user_cards(id,owner_id,card_id,alias,last_four,issued_on,tracking_started_on,is_default)
        values(entry_id,owner,c.card_id,c.alias,c.last_four,c.issued_on,c.tracking_started_on,not exists(select 1 from public.user_cards where owner_id=owner and archived_at is null));
      else
        update public.user_cards set alias=c.alias,last_four=c.last_four,issued_on=c.issued_on,tracking_started_on=c.tracking_started_on,sort_order=c.sort_order,target_scope_key=c.target_scope_key,target_tier_key=c.target_tier_key,version=version+1 where owner_id=owner and id=entry_id;
      end if;
    elsif kind='card.default' then
      if before_row->>'archived_at' is not null then raise exception using errcode='23514',message='archived card cannot be default'; end if;
      for other in select * from public.user_cards where owner_id=owner and is_default and id<>entry_id loop
        update public.user_cards set is_default=false,version=version+1 where id=other.id;
        changes:=changes||jsonb_build_array(jsonb_build_object('table',table_name,'id',other.id,'before',public.ledger_source_json(to_jsonb(other)),'after',public.ledger_source_json(to_jsonb(other)||jsonb_build_object('is_default',false,'version',other.version+1))));
      end loop;
      update public.user_cards set is_default=true,version=version+1 where owner_id=owner and id=entry_id;
    else
      update public.user_cards set archived_at=coalesce(archived_at,now()),is_default=false,version=version+1 where owner_id=owner and id=entry_id;
      if (before_row->>'is_default')::boolean then
        select * into c from public.user_cards where owner_id=owner and archived_at is null order by sort_order,created_at,id limit 1;
        if found then
          update public.user_cards set is_default=true,version=version+1 where owner_id=owner and id=c.id;
          changes:=changes||jsonb_build_array(jsonb_build_object('table',table_name,'id',c.id,'before',public.ledger_source_json(to_jsonb(c)),'after',public.ledger_source_json(to_jsonb(c)||jsonb_build_object('is_default',true,'version',c.version+1))));
        end if;
      end if;
    end if;
  elsif kind like 'month_input.%' then
    perform public.ledger_assert_keys(source,array['month','scopeKind','scopeKey','scopeInstanceKey','data'],array['month','scopeKind','scopeKey','scopeInstanceKey','data']);
    perform public.ledger_assert_keys(source->'data',array['status','amount'],array['status']);
    if jsonb_typeof(source->'scopeKind')<>'string' or jsonb_typeof(source->'scopeKey')<>'string' or jsonb_typeof(source->'scopeInstanceKey')<>'string' or jsonb_typeof(source->'month')<>'string' or jsonb_typeof(source->'data'->'status')<>'string' then raise exception using errcode='22023',message='invalid month input'; end if;
    d.month:=public.ledger_month(source->>'month'); d.scope_kind:=source->>'scopeKind'; d.scope_key:=source->>'scopeKey'; d.scope_instance_key:=source->>'scopeInstanceKey'; d.data_status:=source->'data'->>'status';
    if d.data_status in ('manual_total','remaining') then d.amount:=public.ledger_won(source->'data'->'amount');
    elsif source->'data' ? 'amount' then raise exception using errcode='22023',message='this status does not accept an amount'; end if;
    -- A pre-tracking previous month may use the next policy's scope definition.
    if not exists(select 1 from public.user_cards u join public.card_rule_versions r on r.card_id=u.card_id cross join lateral jsonb_array_elements(case d.scope_kind when 'performance' then r.policy_json->'performanceScopes' else r.policy_json->'quotas' end) s
      where u.owner_id=owner and r.publication_status='published' and r.verification_status='verified' and s->>'key'=d.scope_key
        and (d.scope_instance_key='card:'||u.id||':'||d.scope_kind||':'||d.scope_key or exists(select 1 from public.card_scope_memberships m where m.owner_id=owner and m.target_user_card_id=u.id and m.rule_version_id=r.id and m.scope_kind=d.scope_kind and m.scope_key=d.scope_key and m.scope_instance_key=d.scope_instance_key and m.valid_from_month<=d.month and (m.valid_until_month is null or d.month<m.valid_until_month)))) then
      raise exception using errcode='23514',message='month input scope unavailable';
    end if;
    if is_create then
      insert into public.card_month_inputs(id,owner_id,month,scope_kind,scope_key,scope_instance_key,data_status,amount) values(entry_id,owner,d.month,d.scope_kind,d.scope_key,d.scope_instance_key,d.data_status,d.amount);
    else
      if (before_row->>'month')::date<>d.month or before_row->>'scope_kind'<>d.scope_kind or before_row->>'scope_key'<>d.scope_key or before_row->>'scope_instance_key'<>d.scope_instance_key then raise exception using errcode='23514',message='month input identity is immutable'; end if;
      update public.card_month_inputs set data_status=d.data_status,amount=d.amount,version=version+1,updated_at=now() where owner_id=owner and id=entry_id;
    end if;
  elsif kind like 'membership.%' then
    if kind='membership.remove' then
      delete from public.card_scope_memberships where owner_id=owner and id=entry_id;
    else
      fields:=array['target_user_card_id','contributor_user_card_id','rule_version_id','scope_kind','scope_key','contributor_slot','scope_instance_key','valid_from_month','valid_until_month'];
      perform public.ledger_assert_keys(source,fields,fields); perform public.ledger_validate_fields(source);
      source:=source||jsonb_build_object('valid_from_month',public.ledger_month(source->>'valid_from_month'),'valid_until_month',case when source->>'valid_until_month' is null then null else public.ledger_month(source->>'valid_until_month') end);
      select * into m from jsonb_populate_record(null::public.card_scope_memberships,source);
      if is_create then
        insert into public.card_scope_memberships(id,owner_id,target_user_card_id,contributor_user_card_id,rule_version_id,scope_kind,scope_key,contributor_slot,scope_instance_key,valid_from_month,valid_until_month)
        values(entry_id,owner,m.target_user_card_id,m.contributor_user_card_id,m.rule_version_id,m.scope_kind,m.scope_key,m.contributor_slot,m.scope_instance_key,m.valid_from_month,m.valid_until_month);
      else
        update public.card_scope_memberships set target_user_card_id=m.target_user_card_id,contributor_user_card_id=m.contributor_user_card_id,rule_version_id=m.rule_version_id,scope_kind=m.scope_kind,scope_key=m.scope_key,contributor_slot=m.contributor_slot,scope_instance_key=m.scope_instance_key,valid_from_month=m.valid_from_month,valid_until_month=m.valid_until_month,version=version+1 where owner_id=owner and id=entry_id;
      end if;
    end if;
  end if;
  execute format('select to_jsonb(r) from public.%I r where owner_id=$1 and id=$2',table_name) into after_row using owner,entry_id;
  return changes || jsonb_build_array(jsonb_build_object('table',table_name,'id',entry_id,'before',case when before_row is null then null else public.ledger_source_json(before_row) end,'after',case when after_row is null then null else public.ledger_source_json(after_row) end));
end
$$;

create function public.apply_ledger_command(request_id uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid:=auth.uid(); revision bigint; request_hash text; prior public.ledger_mutation_log;
  commands jsonb; item jsonb; changes jsonb:='[]'; result_ids uuid[]; touched text[]:='{}'; change jsonb; entry_key text;
begin
  if owner is null then raise exception using errcode='42501',message='active owner required'; end if;
  -- Hold membership against revocation until this transaction commits.
  perform 1 from public.app_members where user_id=owner and role='owner' and is_active for share;
  if not found then raise exception using errcode='42501',message='active owner required'; end if;
  if request_id is null or command is null or jsonb_typeof(command)<>'object' then raise exception using errcode='22023',message='request ID and command required'; end if;
  insert into public.owner_ledger_revisions(owner_id) values(owner) on conflict(owner_id) do nothing;
  select r.revision into revision from public.owner_ledger_revisions r where r.owner_id=owner for update;
  request_hash:=encode(sha256(convert_to(command::text,'UTF8')),'hex');
  select * into prior from public.ledger_mutation_log l where l.owner_id=owner and l.request_id=apply_ledger_command.request_id;
  if found then
    if prior.request_hash<>request_hash then raise exception using errcode='22023',message='request ID already used for another payload'; end if;
    return jsonb_build_object('requestId',request_id,'ownerRevision',prior.owner_revision::text,'resultIds',prior.result_ids,'replayed',true);
  end if;
  if command->>'kind'='batch' then
    perform public.ledger_assert_keys(command,array['kind','commands'],array['kind','commands']);
    commands:=command->'commands';
    if jsonb_typeof(commands)<>'array' or jsonb_array_length(commands) not between 1 and 100 then raise exception using errcode='22023',message='batch requires 1..100 commands'; end if;
  else commands:=jsonb_build_array(command); end if;
  for item in select value from jsonb_array_elements(commands) loop
    -- Nested batches cannot pass ledger_apply_entry's finite dispatch.
    for change in select value from jsonb_array_elements(public.ledger_apply_entry(owner,revision,item)) loop
      entry_key:=(change->>'table')||':'||(change->>'id');
      if entry_key=any(touched) then raise exception using errcode='22023',message='an entry may change only once per batch'; end if;
      touched:=array_append(touched,entry_key); changes:=changes||jsonb_build_array(change);
    end loop;
  end loop;
  -- All originals/refunds exist now: validate the final batch state under the owner lock.
  -- actual_amount is the preserved payment principal used by the one TS replay engine.
  if exists(select 1 from public.transactions t join public.transaction_adjustments a on a.owner_id=t.owner_id and a.transaction_id=t.id
    where t.owner_id=owner and a.voided_at is null group by t.id,t.actual_amount having sum(a.amount)>t.actual_amount)
    or exists(select 1 from public.transactions t join public.transaction_adjustments a on a.owner_id=t.owner_id and a.transaction_id=t.id where t.owner_id=owner and a.voided_at is null and a.occurred_at<t.occurred_at) then
    raise exception using errcode='23514',message='refund exceeds original or precedes its occurrence';
  end if;
  if exists(select 1 from jsonb_array_elements(commands) c where c->>'kind' like 'membership.%') then perform public.ledger_validate_bindings(owner); end if;
  revision:=revision+1;
  update public.owner_ledger_revisions r set revision=apply_ledger_command.revision where r.owner_id=owner;
  select array_agg(distinct (c->>'id')::uuid order by (c->>'id')::uuid) into result_ids from jsonb_array_elements(changes) c;
  insert into public.ledger_mutation_log(owner_id,request_id,request_hash,owner_revision,mutation_kind,before_source,after_source,result_ids)
    values(owner,request_id,request_hash,revision,command->>'kind',jsonb_build_object('changes',(select jsonb_agg(c - 'after') from jsonb_array_elements(changes) c)),jsonb_build_object('changes',(select jsonb_agg(c - 'before') from jsonb_array_elements(changes) c)),result_ids);
  return jsonb_build_object('requestId',request_id,'ownerRevision',revision::text,'resultIds',result_ids,'replayed',false);
end
$$;

-- Exactly ONE SQL STABLE statement: every CTE/subquery uses its calling snapshot.
-- Aggregate one JSON result rather than paginated REST rows; no 50/1000 input truncation.
create function public.get_ledger_inputs(through_month text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with owner as materialized (
    select auth.uid() id, public.ledger_month(through_month) month
    where auth.uid() is not null and exists(select 1 from public.app_members where user_id=auth.uid() and role='owner' and is_active)
  ), source_transactions as materialized (
    select t.* from public.transactions t join owner o on o.id=t.owner_id
    where (t.occurred_at at time zone 'Asia/Seoul')::date < o.month + interval '1 month'
  ), source_cards as materialized (
    select u.* from public.user_cards u join owner o on o.id=u.owner_id
  ), start_date as (
    select greatest(date '0001-01-01',least(o.month,coalesce((select min(day) from (
      select (occurred_at at time zone 'Asia/Seoul')::date day from source_transactions
      union all select tracking_started_on from source_cards
      union all select d.month from public.card_month_inputs d where d.owner_id=o.id and d.month<=o.month
      union all select m.valid_from_month from public.card_scope_memberships m where m.owner_id=o.id and m.valid_from_month<=o.month
    ) dates),o.month))) day from owner o
  )
  select jsonb_build_object('ownerId',o.id,'ownerRevision',coalesce((select revision::text from public.owner_ledger_revisions where owner_id=o.id),'0'),'throughMonth',through_month,
    'inputs',jsonb_build_object('ownerId',o.id,'startMonth',to_char(greatest(date '0001-01-01',date_trunc('month',s.day)::date - interval '1 month'),'YYYY-MM'),
      'cards',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(u))||jsonb_build_object('card',to_jsonb(c)) order by u.sort_order,u.id) from source_cards u join public.cards c on c.id=u.card_id),'[]'),
      'ruleVersions',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(r)) order by r.card_id,r.version_order) from public.card_rule_versions r where r.card_id in(select card_id from source_cards)),'[]'),
      'transactions',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(t)) || jsonb_build_object('transaction_benefit_applications',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(a)) order by a.id) from public.transaction_benefit_applications a where a.owner_id=t.owner_id and a.transaction_id=t.id),'[]'::jsonb)) order by t.occurred_at,t.stable_sequence,t.id) from source_transactions t),'[]'),
      'adjustments',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(a)) order by a.stable_sequence,a.id) from public.transaction_adjustments a where a.owner_id=o.id and a.transaction_id in(select id from source_transactions)),'[]'),
      'annotations',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(a)) order by a.id) from public.transaction_annotations a where a.owner_id=o.id and a.transaction_id in(select id from source_transactions)),'[]'),
      'memberships',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(m)) order by m.id) from public.card_scope_memberships m where m.owner_id=o.id and m.valid_from_month<=o.month),'[]'),
      'monthInputs',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(d)) order by d.month,d.id) from public.card_month_inputs d where d.owner_id=o.id and d.month<=o.month),'[]'),
      'merchantRules',coalesce((select jsonb_agg(to_jsonb(r) order by r.priority,r.id) from public.merchant_rules r where r.is_active),'[]')
    )) from owner o cross join start_date s
$$;

-- Old SECURITY DEFINER writers must not remain an alternate route around the lock/audit.
revoke all on function public.set_default_user_card(uuid,uuid) from public,anon,authenticated;
revoke all on function public.delete_user_card_and_promote_default(uuid,uuid) from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.transactions,public.user_cards,public.transaction_benefit_applications,public.transaction_adjustments,public.transaction_annotations,public.card_scope_memberships,public.card_month_inputs,public.owner_ledger_revisions,public.ledger_mutation_log from public,anon,authenticated;
revoke all on sequence public.ledger_stable_sequence from public,anon,authenticated;
revoke all on function public.ledger_decimal_json(jsonb),public.ledger_source_json(jsonb),public.ledger_assert_keys(jsonb,text[],text[]),public.ledger_won(jsonb,numeric),public.ledger_version(jsonb),public.ledger_month(text),public.ledger_validate_fields(jsonb),public.ledger_validate_bindings(uuid),public.ledger_apply_entry(uuid,bigint,jsonb) from public,anon,authenticated;
-- Pure serialization/month helpers are needed by the SECURITY INVOKER SELECT only;
-- these have no IO, privilege escalation, or write side effects.
grant execute on function public.ledger_decimal_json(jsonb),public.ledger_source_json(jsonb),public.ledger_month(text) to authenticated;
revoke all on function public.apply_ledger_command(uuid,jsonb),public.get_ledger_inputs(text) from public,anon,authenticated;
grant execute on function public.apply_ledger_command(uuid,jsonb),public.get_ledger_inputs(text) to authenticated;

-- Task14 household income (same installation as 20260913110000_household_income.sql).
-- Separate household income sources; no card replay input or stored projection.
-- The existing apply_ledger_command owns authorization, owner lock, receipt/hash,
-- revision, audit and final refund/annotation checks. Its body is unchanged.
-- Income-only ECMAScript String.trim WhiteSpace + LineTerminator set (25 code points).
-- Deliberately excludes U+0085, U+180E, U+200B and U+2060; POSIX whitespace differs.
create function public.ledger_income_trim_source_name(value text) returns text
language sql immutable strict set search_path = '' as $$
  select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
revoke all on function public.ledger_income_trim_source_name(text) from public, anon, authenticated, service_role;

create table public.income_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  stable_sequence bigint not null unique check (stable_sequence > 0),
  occurred_at timestamptz not null check (isfinite(occurred_at) and (occurred_at at time zone 'Asia/Seoul')::date between date '0001-01-01' and date '9999-12-31'),
  source_name text not null check (length(public.ledger_income_trim_source_name(source_name)) between 1 and 200),
  amount numeric not null check (amount > 0 and amount <= 9007199254740991 and amount = trunc(amount)),
  ledger_category text check (ledger_category is null or length(ledger_category) <= 120),
  memo text check (memo is null or length(memo) <= 2000),
  input_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.income_entries is 'Raw positive integer KRW income, separate from card transactions. Only versioned atomic ledger commands write this source; exclusion retains history.';

-- Reuse the sequence/identity guard on a source without origin. Existing transaction
-- and adjustment origin immutability remains enforced through their JSON fields.
create or replace function public.guard_ledger_source_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.stable_sequence := nextval('public.ledger_stable_sequence');
    return new;
  end if;
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
    or new.stable_sequence is distinct from old.stable_sequence or (to_jsonb(new)->'origin') is distinct from (to_jsonb(old)->'origin')
  then raise exception using errcode = '23514', message = 'source identity and sequence are immutable'; end if;
  return new;
end;
$$;

create trigger guard_income_identity before insert or update on public.income_entries
  for each row execute function public.guard_ledger_source_identity();
revoke all on function public.guard_ledger_source_identity() from public, anon, authenticated;
alter table public.income_entries enable row level security;
revoke all on table public.income_entries from public, anon, authenticated, service_role;
grant select on table public.income_entries to authenticated;
create policy "active members select own income rows" on public.income_entries for select to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()) and role = 'owner' and is_active));
create index income_entries_owner_occurrence on public.income_entries(owner_id,occurred_at,stable_sequence,id);

-- Extend only the finite internal dispatch; no alternative write RPC.
create or replace function public.ledger_apply_entry(owner uuid, input_revision bigint, command jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  kind text := command->>'kind'; entry_id uuid; table_name text; is_create boolean;
  source jsonb; before_row jsonb; after_row jsonb; changes jsonb := '[]'; other record;
  t public.transactions; a public.transaction_adjustments; n public.transaction_annotations; i public.income_entries;
  c public.user_cards; m public.card_scope_memberships; d public.card_month_inputs;
  expected bigint; fields text[]; original public.transactions; rule public.card_rule_versions; scope jsonb; month date;
begin
  if kind = any(array['income.create','transaction.create','refund.create','annotation.create','card.create','month_input.create','membership.create']) then
    perform public.ledger_assert_keys(command,array['kind','id','source'],array['kind','id','source']); is_create:=true;
  elsif kind = any(array['income.update','transaction.update','card.update']) then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version','patch'],array['kind','id','expected_version','patch']); is_create:=false;
  elsif kind in ('income.exclude','transaction.exclude') then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version','excluded'],array['kind','id','expected_version','excluded']); is_create:=false;
    if jsonb_typeof(command->'excluded')<>'boolean' then raise exception using errcode='22023',message='invalid exclusion flag'; end if;
  elsif kind = any(array['refund.update','annotation.update','month_input.update','membership.update']) then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version','source'],array['kind','id','expected_version','source']); is_create:=false;
  elsif kind = any(array['refund.void','annotation.void','card.default','card.archive','membership.remove']) then
    perform public.ledger_assert_keys(command,array['kind','id','expected_version'],array['kind','id','expected_version']); is_create:=false;
  else raise exception using errcode='22023',message='unknown ledger command'; end if;
  if jsonb_typeof(command->'id')<>'string' then raise exception using errcode='22023',message='invalid entry ID'; end if;
  entry_id := (command->>'id')::uuid;
  table_name := case split_part(kind,'.',1) when 'income' then 'income_entries' when 'transaction' then 'transactions' when 'refund' then 'transaction_adjustments' when 'annotation' then 'transaction_annotations' when 'card' then 'user_cards' when 'month_input' then 'card_month_inputs' when 'membership' then 'card_scope_memberships' end;
  -- Identifier is selected solely from the finite mapping above, never from user input.
  if not is_create then
    expected := public.ledger_version(command->'expected_version');
    execute format('select to_jsonb(r) from public.%I r where owner_id=$1 and id=$2',table_name) into before_row using owner,entry_id;
    if before_row is null then raise exception using errcode='42501',message='entry unavailable'; end if;
    if expected<1 or expected<>(before_row->>'version')::bigint then raise exception using errcode='40001',message='stale entry version'; end if;
  end if;
  source := coalesce(command->'source',command->'patch');

  if kind like 'income.%' then
    if kind='income.exclude' then
      update public.income_entries set input_excluded=(command->>'excluded')::boolean,version=version+1,updated_at=now() where owner_id=owner and id=entry_id;
    else
      fields:=array['occurred_at','source_name','amount','ledger_category','memo'];
      perform public.ledger_assert_keys(source,fields,case when is_create then fields else '{}'::text[] end);
      if source='{}'::jsonb then raise exception using errcode='22023',message='empty patch'; end if;
      perform public.ledger_validate_fields(source);
      if source ? 'amount' then perform public.ledger_won(source->'amount',1); end if;
      select * into i from jsonb_populate_record(null::public.income_entries,coalesce(before_row,'{}') || source);
      i.source_name := public.ledger_income_trim_source_name(i.source_name);
      if length(i.source_name) not between 1 and 200 then
        raise exception using errcode='22023',message='income source name requires 1..200 characters';
      end if;
      if is_create then
        insert into public.income_entries(id,owner_id,occurred_at,source_name,amount,ledger_category,memo)
        values(entry_id,owner,i.occurred_at,i.source_name,i.amount,i.ledger_category,i.memo);
      else
        update public.income_entries set occurred_at=i.occurred_at,source_name=i.source_name,amount=i.amount,ledger_category=i.ledger_category,memo=i.memo,version=version+1,updated_at=now() where owner_id=owner and id=entry_id;
      end if;
    end if;
  elsif kind like 'transaction.%' then
    if kind<>'transaction.exclude' then
      fields:=array['occurred_at','merchant_name','amount','payment_method','user_card_id','payment_channel','installment_months','ledger_category','is_fixed_cost','memo'];
      perform public.ledger_assert_keys(source,fields,case when is_create then fields else '{}'::text[] end);
      if source='{}'::jsonb then raise exception using errcode='22023',message='empty patch'; end if;
      perform public.ledger_validate_fields(source);
      if source ? 'amount' then perform public.ledger_won(source->'amount',1); end if;
      select * into t from jsonb_populate_record(null::public.transactions,coalesce(before_row,'{}') || source);
      if length(btrim(t.merchant_name))=0 then raise exception using errcode='22023',message='merchant is required'; end if;
      if t.payment_method in ('credit_card','check_card') then
        if not exists(select 1 from public.user_cards u join public.cards p on p.id=u.card_id where u.id=t.user_card_id and u.owner_id=owner and p.card_type=t.payment_method and (u.archived_at is null or (not is_create and t.user_card_id=(before_row->>'user_card_id')::uuid))) then
          raise exception using errcode='42501',message='payment card unavailable';
        end if;
      elsif t.user_card_id is not null then raise exception using errcode='22023',message='non-card payment cannot reference a card'; end if;
      if is_create then
        insert into public.transactions(id,owner_id,occurred_at,merchant_name,amount,actual_amount,benefit_amount,final_amount,eligible_spend_amount,is_performance_eligible,payment_method,user_card_id,payment_channel,installment_months,ledger_category,is_fixed_cost,memo,origin,legacy_review_required)
        values(entry_id,owner,t.occurred_at,btrim(t.merchant_name),t.amount,t.amount,0,t.amount,0,false,t.payment_method,t.user_card_id,t.payment_channel,t.installment_months,t.ledger_category,t.is_fixed_cost,t.memo,'new',false);
      else
        update public.transactions set occurred_at=t.occurred_at,merchant_name=btrim(t.merchant_name),amount=t.amount,
          actual_amount=case when source ? 'amount' then t.amount else actual_amount end,
          payment_method=t.payment_method,user_card_id=t.user_card_id,payment_channel=t.payment_channel,installment_months=t.installment_months,ledger_category=t.ledger_category,is_fixed_cost=t.is_fixed_cost,memo=t.memo,version=version+1
          where owner_id=owner and id=entry_id;
      end if;
    else
      update public.transactions set input_excluded=(command->>'excluded')::boolean,version=version+1 where owner_id=owner and id=entry_id;
    end if;
  elsif kind like 'refund.%' then
    if kind='refund.void' then
      update public.transaction_adjustments set voided_at=coalesce(voided_at,now()),version=version+1 where owner_id=owner and id=entry_id;
    else
      fields:=array['transaction_id','occurred_at','amount','memo'];
      perform public.ledger_assert_keys(source,fields,fields); perform public.ledger_validate_fields(source); perform public.ledger_won(source->'amount',1);
      select * into a from jsonb_populate_record(null::public.transaction_adjustments,source);
      select * into original from public.transactions where owner_id=owner and id=a.transaction_id;
      if not found then raise exception using errcode='42501',message='original transaction unavailable'; end if;
      if a.occurred_at < original.occurred_at then raise exception using errcode='23514',message='refund precedes original'; end if;
      if not is_create and (before_row->>'transaction_id')::uuid<>a.transaction_id then raise exception using errcode='23514',message='refund original is immutable'; end if;
      if is_create then
        insert into public.transaction_adjustments(id,owner_id,transaction_id,occurred_at,amount,memo) values(entry_id,owner,a.transaction_id,a.occurred_at,a.amount,a.memo);
      else
        if before_row->>'voided_at' is not null then raise exception using errcode='23514',message='voided refund cannot be edited'; end if;
        update public.transaction_adjustments set occurred_at=a.occurred_at,amount=a.amount,memo=a.memo,version=version+1 where owner_id=owner and id=entry_id;
      end if;
    end if;
  elsif kind like 'annotation.%' then
    if kind='annotation.void' then
      update public.transaction_annotations set voided_at=coalesce(voided_at,now()),version=version+1 where owner_id=owner and id=entry_id;
    else
      fields:=array['transaction_id','target_kind','target_key','scope_instance_key','amount','basis_auto_amount','basis_input_revision','basis_rule_version_id'];
      perform public.ledger_assert_keys(source,fields,fields); perform public.ledger_validate_fields(source);
      if public.ledger_version(source->'basis_input_revision')<>input_revision then raise exception using errcode='40001',message='stale annotation basis revision'; end if;
      select * into n from jsonb_populate_record(null::public.transaction_annotations,source);
      select * into original from public.transactions where owner_id=owner and id=n.transaction_id;
      if not found then raise exception using errcode='42501',message='original transaction unavailable'; end if;
      if not is_create and ((before_row->>'transaction_id')::uuid<>n.transaction_id or before_row->>'voided_at' is not null) then raise exception using errcode='23514',message='annotation original is immutable or voided'; end if;
      month:=date_trunc('month',original.occurred_at at time zone 'Asia/Seoul')::date;
      select * into rule from public.card_rule_versions where id=n.basis_rule_version_id and publication_status='published' and verification_status='verified';
      if not found then raise exception using errcode='23514',message='annotation needs verified target rule'; end if;
      if n.target_kind='performance' then
        if not exists(select 1 from public.user_cards u cross join lateral jsonb_array_elements(rule.policy_json->'performanceScopes') s
          where u.owner_id=owner and u.card_id=rule.card_id and s->>'key'=n.target_key
            and coalesce((select m.scope_instance_key from public.card_scope_memberships m where m.owner_id=owner and m.target_user_card_id=u.id and m.rule_version_id=rule.id and m.scope_kind='performance' and m.scope_key=n.target_key and m.valid_from_month<=month and (m.valid_until_month is null or month<m.valid_until_month) order by m.id limit 1),'card:'||u.id||':performance:'||n.target_key)=n.scope_instance_key
            and (u.id=original.user_card_id or exists(select 1 from public.card_scope_memberships m where m.owner_id=owner and m.target_user_card_id=u.id and m.contributor_user_card_id=original.user_card_id and m.rule_version_id=rule.id and m.scope_kind='performance' and m.scope_key=n.target_key and m.valid_from_month<=month and (m.valid_until_month is null or month<m.valid_until_month)))) then
          raise exception using errcode='23514',message='annotation scope is not a direct contributor target';
        end if;
      elsif n.target_kind in ('benefit_eligible','confirmed_benefit') then
        if not exists(select 1 from public.user_cards u cross join lateral jsonb_array_elements(rule.policy_json->'benefits') b where u.id=original.user_card_id and u.owner_id=owner and u.card_id=rule.card_id and b->>'key'=n.target_key) then
          raise exception using errcode='23514',message='annotation benefit target unavailable';
        end if;
      else raise exception using errcode='22023',message='unknown annotation target'; end if;
      if not (rule.effective_from<=(original.occurred_at at time zone 'Asia/Seoul')::date and (rule.effective_until is null or (original.occurred_at at time zone 'Asia/Seoul')::date<rule.effective_until))
        or exists(select 1 from public.card_rule_versions r where r.card_id=rule.card_id and r.publication_status='published' and r.verification_status='verified' and r.version_order>rule.version_order and r.effective_from<=(original.occurred_at at time zone 'Asia/Seoul')::date and (r.effective_until is null or (original.occurred_at at time zone 'Asia/Seoul')::date<r.effective_until)) then
        raise exception using errcode='40001',message='annotation rule is not current for source day';
      end if;
      if is_create then
        insert into public.transaction_annotations(id,owner_id,transaction_id,target_kind,target_key,scope_instance_key,amount,basis_auto_amount,basis_input_revision,basis_rule_version_id)
        values(entry_id,owner,n.transaction_id,n.target_kind,n.target_key,n.scope_instance_key,n.amount,n.basis_auto_amount,n.basis_input_revision,n.basis_rule_version_id);
      else
        update public.transaction_annotations set target_kind=n.target_kind,target_key=n.target_key,scope_instance_key=n.scope_instance_key,amount=n.amount,basis_auto_amount=n.basis_auto_amount,basis_input_revision=n.basis_input_revision,basis_rule_version_id=n.basis_rule_version_id,review_status='resolved',version=version+1 where owner_id=owner and id=entry_id;
      end if;
    end if;
  elsif kind like 'card.%' then
    if kind in ('card.create','card.update') then
      fields:=case when is_create then array['card_id','alias','last_four','issued_on','tracking_started_on'] else array['alias','last_four','issued_on','tracking_started_on','sort_order','target_scope_key','target_tier_key'] end;
      perform public.ledger_assert_keys(source,fields,case when is_create then array['card_id','alias'] else '{}'::text[] end); perform public.ledger_validate_fields(source);
      if source='{}'::jsonb then raise exception using errcode='22023',message='empty patch'; end if;
      select * into c from jsonb_populate_record(null::public.user_cards,coalesce(before_row,'{}')||source);
      if c.target_scope_key is not null and not exists (
        select 1 from public.card_rule_versions r cross join lateral jsonb_array_elements(r.policy_json->'performanceScopes') s
        cross join lateral jsonb_array_elements(s->'tiers') tier
        where r.card_id=c.card_id and r.publication_status='published' and r.verification_status='verified'
          and s->>'key'=c.target_scope_key and tier->>'key'=c.target_tier_key
      ) then raise exception using errcode='23514',message='target performance tier unavailable'; end if;
      if is_create then
        insert into public.user_cards(id,owner_id,card_id,alias,last_four,issued_on,tracking_started_on,is_default)
        values(entry_id,owner,c.card_id,c.alias,c.last_four,c.issued_on,c.tracking_started_on,not exists(select 1 from public.user_cards where owner_id=owner and archived_at is null));
      else
        update public.user_cards set alias=c.alias,last_four=c.last_four,issued_on=c.issued_on,tracking_started_on=c.tracking_started_on,sort_order=c.sort_order,target_scope_key=c.target_scope_key,target_tier_key=c.target_tier_key,version=version+1 where owner_id=owner and id=entry_id;
      end if;
    elsif kind='card.default' then
      if before_row->>'archived_at' is not null then raise exception using errcode='23514',message='archived card cannot be default'; end if;
      for other in select * from public.user_cards where owner_id=owner and is_default and id<>entry_id loop
        update public.user_cards set is_default=false,version=version+1 where id=other.id;
        changes:=changes||jsonb_build_array(jsonb_build_object('table',table_name,'id',other.id,'before',public.ledger_source_json(to_jsonb(other)),'after',public.ledger_source_json(to_jsonb(other)||jsonb_build_object('is_default',false,'version',other.version+1))));
      end loop;
      update public.user_cards set is_default=true,version=version+1 where owner_id=owner and id=entry_id;
    else
      update public.user_cards set archived_at=coalesce(archived_at,now()),is_default=false,version=version+1 where owner_id=owner and id=entry_id;
      if (before_row->>'is_default')::boolean then
        select * into c from public.user_cards where owner_id=owner and archived_at is null order by sort_order,created_at,id limit 1;
        if found then
          update public.user_cards set is_default=true,version=version+1 where owner_id=owner and id=c.id;
          changes:=changes||jsonb_build_array(jsonb_build_object('table',table_name,'id',c.id,'before',public.ledger_source_json(to_jsonb(c)),'after',public.ledger_source_json(to_jsonb(c)||jsonb_build_object('is_default',true,'version',c.version+1))));
        end if;
      end if;
    end if;
  elsif kind like 'month_input.%' then
    perform public.ledger_assert_keys(source,array['month','scopeKind','scopeKey','scopeInstanceKey','data'],array['month','scopeKind','scopeKey','scopeInstanceKey','data']);
    perform public.ledger_assert_keys(source->'data',array['status','amount'],array['status']);
    if jsonb_typeof(source->'scopeKind')<>'string' or jsonb_typeof(source->'scopeKey')<>'string' or jsonb_typeof(source->'scopeInstanceKey')<>'string' or jsonb_typeof(source->'month')<>'string' or jsonb_typeof(source->'data'->'status')<>'string' then raise exception using errcode='22023',message='invalid month input'; end if;
    d.month:=public.ledger_month(source->>'month'); d.scope_kind:=source->>'scopeKind'; d.scope_key:=source->>'scopeKey'; d.scope_instance_key:=source->>'scopeInstanceKey'; d.data_status:=source->'data'->>'status';
    if d.data_status in ('manual_total','remaining') then d.amount:=public.ledger_won(source->'data'->'amount');
    elsif source->'data' ? 'amount' then raise exception using errcode='22023',message='this status does not accept an amount'; end if;
    -- A pre-tracking previous month may use the next policy's scope definition.
    if not exists(select 1 from public.user_cards u join public.card_rule_versions r on r.card_id=u.card_id cross join lateral jsonb_array_elements(case d.scope_kind when 'performance' then r.policy_json->'performanceScopes' else r.policy_json->'quotas' end) s
      where u.owner_id=owner and r.publication_status='published' and r.verification_status='verified' and s->>'key'=d.scope_key
        and (d.scope_instance_key='card:'||u.id||':'||d.scope_kind||':'||d.scope_key or exists(select 1 from public.card_scope_memberships m where m.owner_id=owner and m.target_user_card_id=u.id and m.rule_version_id=r.id and m.scope_kind=d.scope_kind and m.scope_key=d.scope_key and m.scope_instance_key=d.scope_instance_key and m.valid_from_month<=d.month and (m.valid_until_month is null or d.month<m.valid_until_month)))) then
      raise exception using errcode='23514',message='month input scope unavailable';
    end if;
    if is_create then
      insert into public.card_month_inputs(id,owner_id,month,scope_kind,scope_key,scope_instance_key,data_status,amount) values(entry_id,owner,d.month,d.scope_kind,d.scope_key,d.scope_instance_key,d.data_status,d.amount);
    else
      if (before_row->>'month')::date<>d.month or before_row->>'scope_kind'<>d.scope_kind or before_row->>'scope_key'<>d.scope_key or before_row->>'scope_instance_key'<>d.scope_instance_key then raise exception using errcode='23514',message='month input identity is immutable'; end if;
      update public.card_month_inputs set data_status=d.data_status,amount=d.amount,version=version+1,updated_at=now() where owner_id=owner and id=entry_id;
    end if;
  elsif kind like 'membership.%' then
    if kind='membership.remove' then
      delete from public.card_scope_memberships where owner_id=owner and id=entry_id;
    else
      fields:=array['target_user_card_id','contributor_user_card_id','rule_version_id','scope_kind','scope_key','contributor_slot','scope_instance_key','valid_from_month','valid_until_month'];
      perform public.ledger_assert_keys(source,fields,fields); perform public.ledger_validate_fields(source);
      source:=source||jsonb_build_object('valid_from_month',public.ledger_month(source->>'valid_from_month'),'valid_until_month',case when source->>'valid_until_month' is null then null else public.ledger_month(source->>'valid_until_month') end);
      select * into m from jsonb_populate_record(null::public.card_scope_memberships,source);
      if is_create then
        insert into public.card_scope_memberships(id,owner_id,target_user_card_id,contributor_user_card_id,rule_version_id,scope_kind,scope_key,contributor_slot,scope_instance_key,valid_from_month,valid_until_month)
        values(entry_id,owner,m.target_user_card_id,m.contributor_user_card_id,m.rule_version_id,m.scope_kind,m.scope_key,m.contributor_slot,m.scope_instance_key,m.valid_from_month,m.valid_until_month);
      else
        update public.card_scope_memberships set target_user_card_id=m.target_user_card_id,contributor_user_card_id=m.contributor_user_card_id,rule_version_id=m.rule_version_id,scope_kind=m.scope_kind,scope_key=m.scope_key,contributor_slot=m.contributor_slot,scope_instance_key=m.scope_instance_key,valid_from_month=m.valid_from_month,valid_until_month=m.valid_until_month,version=version+1 where owner_id=owner and id=entry_id;
      end if;
    end if;
  end if;
  execute format('select to_jsonb(r) from public.%I r where owner_id=$1 and id=$2',table_name) into after_row using owner,entry_id;
  return changes || jsonb_build_array(jsonb_build_object('table',table_name,'id',entry_id,'before',case when before_row is null then null else public.ledger_source_json(before_row) end,'after',case when after_row is null then null else public.ledger_source_json(after_row) end));
end
$$;

-- One SQL STABLE statement for both card and household sources, with lossless serialization.
create or replace function public.get_ledger_inputs(through_month text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with owner as materialized (
    select auth.uid() id, public.ledger_month(through_month) month
    where auth.uid() is not null and exists(select 1 from public.app_members where user_id=auth.uid() and role='owner' and is_active)
  ), source_transactions as materialized (
    select t.* from public.transactions t join owner o on o.id=t.owner_id
    where (t.occurred_at at time zone 'Asia/Seoul')::date < o.month + interval '1 month'
  ), source_cards as materialized (
    select u.* from public.user_cards u join owner o on o.id=u.owner_id
  ), start_date as (
    select greatest(date '0001-01-01',least(o.month,coalesce((select min(day) from (
      select (occurred_at at time zone 'Asia/Seoul')::date day from source_transactions
      union all select tracking_started_on from source_cards
      union all select d.month from public.card_month_inputs d where d.owner_id=o.id and d.month<=o.month
      union all select m.valid_from_month from public.card_scope_memberships m where m.owner_id=o.id and m.valid_from_month<=o.month
    ) dates),o.month))) day from owner o
  )
  select jsonb_build_object('ownerId',o.id,'ownerRevision',coalesce((select revision::text from public.owner_ledger_revisions where owner_id=o.id),'0'),'throughMonth',through_month,
    'household',jsonb_build_object('version',1,'incomes',coalesce((
      select jsonb_agg(public.ledger_source_json(to_jsonb(i)) order by i.occurred_at,i.stable_sequence,i.id)
      from public.income_entries i where i.owner_id=o.id and (i.occurred_at at time zone 'Asia/Seoul')::date < o.month + interval '1 month'
    ),'[]'::jsonb)),
    'inputs',jsonb_build_object('ownerId',o.id,'startMonth',to_char(greatest(date '0001-01-01',date_trunc('month',s.day)::date - interval '1 month'),'YYYY-MM'),
      'cards',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(u))||jsonb_build_object('card',to_jsonb(c)) order by u.sort_order,u.id) from source_cards u join public.cards c on c.id=u.card_id),'[]'),
      'ruleVersions',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(r)) order by r.card_id,r.version_order) from public.card_rule_versions r where r.card_id in(select card_id from source_cards)),'[]'),
      'transactions',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(t)) || jsonb_build_object('transaction_benefit_applications',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(a)) order by a.id) from public.transaction_benefit_applications a where a.owner_id=t.owner_id and a.transaction_id=t.id),'[]'::jsonb)) order by t.occurred_at,t.stable_sequence,t.id) from source_transactions t),'[]'),
      'adjustments',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(a)) order by a.stable_sequence,a.id) from public.transaction_adjustments a where a.owner_id=o.id and a.transaction_id in(select id from source_transactions)),'[]'),
      'annotations',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(a)) order by a.id) from public.transaction_annotations a where a.owner_id=o.id and a.transaction_id in(select id from source_transactions)),'[]'),
      'memberships',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(m)) order by m.id) from public.card_scope_memberships m where m.owner_id=o.id and m.valid_from_month<=o.month),'[]'),
      'monthInputs',coalesce((select jsonb_agg(public.ledger_source_json(to_jsonb(d)) order by d.month,d.id) from public.card_month_inputs d where d.owner_id=o.id and d.month<=o.month),'[]'),
      'merchantRules',coalesce((select jsonb_agg(to_jsonb(r) order by r.priority,r.id) from public.merchant_rules r where r.is_active),'[]')
    )) from owner o cross join start_date s
$$;
