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
