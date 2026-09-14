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
