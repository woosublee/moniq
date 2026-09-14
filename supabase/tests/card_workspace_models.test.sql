-- Run in a disposable Supabase DB after all migrations OR the fresh schema.sql.
-- Auth fixtures are synthetic. This script always rolls back. Not executed in Task 2.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, aud, role) values
 ('10000000-0000-4000-8000-000000000001', 'workspace-one@moniq.test', 'authenticated', 'authenticated'),
 ('10000000-0000-4000-8000-000000000002', 'workspace-two@moniq.test', 'authenticated', 'authenticated');
insert into public.app_members (user_id, role) values
 ('10000000-0000-4000-8000-000000000001', 'owner'), ('10000000-0000-4000-8000-000000000002', 'owner');
insert into public.cards (id, issuer, name, card_type, searchable_text) values
 ('20000000-0000-4000-8000-000000000001', 'Synthetic', 'Same product', 'credit_card', 'synthetic');
insert into public.user_cards (id, owner_id, card_id) values
 ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.user_cards where owner_id = '10000000-0000-4000-8000-000000000001'), 2, 'two instances of the same product retain different IDs');
select throws_ok($$update public.user_cards set last_four = '12345678' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', null, 'only four digits accepted');

insert into public.card_rule_versions (id, card_id, version_label, version_order, source_url, effective_from, checked_on, verification_status, publication_status, policy_json) values
 ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'v1', 1, 'https://example.com/terms', '2026-01-01', '2026-01-01', 'verified', 'published',
 '{"schemaVersion":1,"performanceScopes":[{"key":"spend","contributorSlots":["self","companion"],"basis":"gross","exclusions":[],"tiers":[{"key":"base","minimumSpend":0}]}],"quotas":[{"key":"cafe","sharing":{"kind":"shared","contributorSlots":["self","partner"]},"limit":{"kind":"fixed","amount":10000}}],"benefits":[],"cancellation":{"kind":"verified_original_month_net_replay"}}');
select throws_ok($$insert into public.card_rule_versions (card_id,version_label,version_order,verification_status,policy_json) values ('20000000-0000-4000-8000-000000000001','bad-json',99,'unverified','{}')$$, '23514', null, 'policy JSON must declare schemaVersion even before publication');
select throws_ok($$update public.card_rule_versions set version_label = 'rewritten' where id = '40000000-0000-4000-8000-000000000001'$$, '23514', null, 'published metadata immutable');
select throws_ok($$delete from public.card_rule_versions where id = '40000000-0000-4000-8000-000000000001'$$, '23514', null, 'published version cannot be deleted');
select lives_ok($$insert into public.card_rule_versions (card_id, version_label, version_order, source_url, effective_from, checked_on, verification_status, publication_status, policy_json)
 select card_id, 'v2', 2, source_url, '2026-09-01', checked_on, verification_status, publication_status, policy_json from public.card_rule_versions where id = '40000000-0000-4000-8000-000000000001'$$, 'overlap represented by a higher immutable order');
select is((select version_order from public.card_rule_versions where card_id = '20000000-0000-4000-8000-000000000001' and publication_status = 'published' and verification_status = 'verified' and effective_from <= '2026-09-13' and (effective_until is null or effective_until > '2026-09-13') order by version_order desc limit 1), 2, 'highest applicable published order wins');

insert into public.card_scope_memberships (owner_id, target_user_card_id, contributor_user_card_id, rule_version_id, scope_kind, scope_key, contributor_slot, scope_instance_key, valid_from_month, valid_until_month) values
 ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'performance', 'spend', 'companion', 'a-spend', '2026-01-01', '2026-10-01');
select is((select count(*)::int from public.card_scope_memberships where target_user_card_id = '30000000-0000-4000-8000-000000000002'), 0, 'A counts B without silently making B count A');
select lives_ok($$insert into public.card_scope_memberships (owner_id, target_user_card_id, contributor_user_card_id, rule_version_id, scope_kind, scope_key, contributor_slot, scope_instance_key, valid_from_month)
 values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','quota','cafe','partner','family-cafe','2026-01-01')$$, 'quota sharing independent from performance sharing');
select throws_ok($$insert into public.card_scope_memberships (owner_id, target_user_card_id, contributor_user_card_id, rule_version_id, scope_kind, scope_key, contributor_slot, scope_instance_key, valid_from_month)
 values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','performance','spend','companion','a-spend','2026-10-01')$$, '23503', null, 'cross-owner contributor rejected even for privileged writes');
select throws_ok($$insert into public.card_scope_memberships (owner_id, target_user_card_id, contributor_user_card_id, rule_version_id, scope_kind, scope_key, contributor_slot, scope_instance_key, valid_from_month)
 values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','performance','spend','companion','a-spend','2026-09-01')$$, '23P01', null, 'same slot cannot overlap its month interval');
select lives_ok($$insert into public.card_scope_memberships (owner_id, target_user_card_id, contributor_user_card_id, rule_version_id, scope_kind, scope_key, contributor_slot, scope_instance_key, valid_from_month)
 values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','performance','spend','companion','a-spend','2026-10-01')$$, 'adjacent half-open month intervals accepted');

insert into public.card_month_inputs (owner_id, month, scope_instance_key, scope_kind, scope_key, data_status, amount) values
 ('10000000-0000-4000-8000-000000000001', '2026-08-01', 'a-spend', 'performance', 'spend', 'manual_total', 0),
 ('10000000-0000-4000-8000-000000000001', '2026-08-01', 'family-cafe', 'quota', 'cafe', 'unknown', null);
select is((select amount::text from public.card_month_inputs where scope_instance_key = 'a-spend'), '0', 'manual zero stored rather than missing');
select is((select data_status from public.card_month_inputs where scope_instance_key = 'family-cafe'), 'unknown', 'manual spend does not imply known remaining quota');
select throws_ok($$insert into public.card_month_inputs (owner_id,month,scope_instance_key,scope_kind,scope_key,data_status,amount) values ('10000000-0000-4000-8000-000000000001','2026-09-13','bad','performance','spend','manual_total',0)$$, '23514', null, 'month key must be first day');
select throws_ok($$insert into public.card_month_inputs (owner_id,month,scope_instance_key,scope_kind,scope_key,data_status,amount) values ('10000000-0000-4000-8000-000000000001','2026-09-01','bad','quota','cafe','manual_total',0)$$, '23514', null, 'performance total cannot be a quota state');

insert into public.transactions (id, owner_id, occurred_at, merchant_name, amount, actual_amount, final_amount, eligible_spend_amount, payment_method, user_card_id, origin) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-09-30T14:59:59.999Z','Legacy decimal',1234.56,1234.56,1234.56,1234.56,'credit_card','30000000-0000-4000-8000-000000000001','legacy');
select throws_ok($$insert into public.transactions (owner_id,occurred_at,merchant_name,amount,actual_amount,final_amount,eligible_spend_amount,payment_method,origin) values ('10000000-0000-4000-8000-000000000001',now(),'Fractional new',1.25,1.25,1.25,1.25,'cash','new')$$, '23514', null, 'new fractional KRW rejected rather than rounded');
select lives_ok($$insert into public.transactions (owner_id,occurred_at,merchant_name,amount,actual_amount,final_amount,eligible_spend_amount,payment_method,origin) values ('10000000-0000-4000-8000-000000000001',now(),'Large new',9007199254740991,9007199254740991,9007199254740991,9007199254740991,'cash','new')$$, 'full safe integer range retained without numeric(12,2) truncation');
select throws_ok($$update public.transactions set stable_sequence = stable_sequence + 100 where id = '50000000-0000-4000-8000-000000000001'$$, '23514', null, 'stable original sequence cannot change');
select lives_ok($$insert into public.transactions (id,owner_id,occurred_at,merchant_name,amount,actual_amount,final_amount,eligible_spend_amount,payment_method,stable_sequence) values ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',now(),'Sequence input',1,1,1,1,'cash',-99)$$, 'sequence supplied by caller does not override database order');
select ok((select stable_sequence > 0 from public.transactions where id='50000000-0000-4000-8000-000000000002'), 'database assigns stable sequence');
select is((select amount::text from public.transactions where id='50000000-0000-4000-8000-000000000001'), '1234.56', 'legacy fraction remains exact');
select is((select count(*)::int from public.transactions where id='50000000-0000-4000-8000-000000000001' and occurred_at >= '2026-08-31T15:00:00Z' and occurred_at < '2026-09-30T15:00:00Z'), 1, 'Seoul final millisecond included in selected month');
insert into public.transaction_adjustments (owner_id,transaction_id,occurred_at,amount) values
 ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','2026-10-01',100);
select throws_ok($$insert into public.transaction_adjustments (owner_id,transaction_id,occurred_at,amount) values ('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','2026-10-01',100)$$, '23503', null, 'refund cannot reference another owner source');
insert into public.transaction_annotations (owner_id,transaction_id,target_kind,target_key,scope_instance_key,amount,origin,review_status,basis_auto_amount,basis_input_revision,basis_rule_version_id) values
 ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','performance','spend','a-spend',1200,'manual','resolved',1234.56,0,'40000000-0000-4000-8000-000000000001');
select is((select basis_auto_amount::text from public.transaction_annotations where transaction_id='50000000-0000-4000-8000-000000000001'), '1234.56', 'annotation keeps automatic evidence separate from override');

select lives_ok($$insert into public.transaction_annotations (owner_id,transaction_id,target_kind,target_key,scope_instance_key,amount,basis_input_revision) values ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','performance','spend','b-spend',800,0)$$, 'one purchase can have different recognized overrides for overlapping target scopes');
select throws_ok($$insert into public.transaction_annotations (owner_id,transaction_id,target_kind,target_key,scope_instance_key,amount,basis_input_revision) values ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','performance','spend','a-spend',700,0)$$, '23505', null, 'same target scope cannot have two active overrides');

-- benefit_eligible is an automatic-benefit fixed amount override, not eligible spend.
-- Explicit zero is a value, and its confirmed counterpart is a separate observation.
insert into public.transaction_annotations (owner_id,transaction_id,target_kind,target_key,amount,basis_input_revision) values
 ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','benefit_eligible','coffee',0,0),
 ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','confirmed_benefit','coffee',0,0);
select is((select count(*)::int from public.transaction_annotations where transaction_id='50000000-0000-4000-8000-000000000001' and target_key='coffee' and target_kind in ('benefit_eligible','confirmed_benefit')),2,'automatic override and confirmed benefit coexist for one benefit key');
select is((select amount::text from public.transaction_annotations where transaction_id='50000000-0000-4000-8000-000000000001' and target_key='coffee' and target_kind='benefit_eligible'),'0','zero automatic-benefit override retained as an explicit value');
select is((select amount::text from public.transaction_annotations where transaction_id='50000000-0000-4000-8000-000000000001' and target_key='coffee' and target_kind='confirmed_benefit'),'0','zero confirmed benefit retained independently');

insert into public.owner_ledger_revisions (owner_id,revision) values ('10000000-0000-4000-8000-000000000001',1);
insert into public.ledger_mutation_log (owner_id,request_id,request_hash,owner_revision,mutation_kind,before_source,after_source,result_ids) values
 ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',repeat('a',64),1,'annotate',null,'{"amount":"1200"}',array['50000000-0000-4000-8000-000000000001'::uuid]);
select throws_ok($$update public.ledger_mutation_log set after_source = '{}' where request_id='60000000-0000-4000-8000-000000000001'$$, '23514', null, 'mutation audit log append only');
select throws_ok($$insert into public.ledger_mutation_log (owner_id,request_id,request_hash,owner_revision,mutation_kind,before_source,after_source,result_ids) values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',repeat('b',64),2,'duplicate',null,'{}','{}')$$, '23505', null, 'request UUID is unique per owner');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.card_month_inputs),2,'active owner reads own month inputs');
select throws_ok($$update public.owner_ledger_revisions set revision=99$$, '42501', null, 'ordinary clients cannot forge owner revision');
select throws_ok($$update public.card_rule_versions set version_label='user-edit'$$, '42501', null, 'ordinary clients cannot administer policies');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.card_month_inputs),0,'other owner cannot read month inputs');
select is((select count(*)::int from public.transaction_annotations),0,'other owner cannot read annotations');
select is((select count(*)::int from public.transaction_adjustments),0,'other owner cannot read refunds');
select is((select count(*)::int from public.ledger_mutation_log),0,'other owner cannot read audit sources');
reset role;
update public.app_members set is_active=false where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.card_month_inputs),0,'revoked owner cannot read month inputs');
select is((select count(*)::int from public.card_rule_versions),0,'revoked owner cannot read rule versions');
select is((select count(*)::int from public.card_scope_memberships),0,'revoked owner cannot read sharing');
select is((select count(*)::int from public.owner_ledger_revisions),0,'revoked owner cannot read revision');
reset role;
select * from finish();
rollback;
