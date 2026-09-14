-- NOT EXECUTED in Task4: no Supabase/Postgres tools are installed here.
-- Run only in a disposable Supabase database after migrations (or fresh schema.sql):
--   psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ledger-commands.test.sql
-- Never substitute the linked/production database. All fixtures are synthetic; rollback below.
-- Concurrency: node supabase/tests/ledger-commands-concurrency.mjs <explicit-local-disposable-url>
-- The separate harness observes actual lock blocking; it has NOT been run here.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('a1000000-0000-4000-8000-000000000001','ledger-one@moniq.test','authenticated','authenticated'),
 ('a1000000-0000-4000-8000-000000000002','ledger-two@moniq.test','authenticated','authenticated');
insert into public.app_members(user_id,role) values
 ('a1000000-0000-4000-8000-000000000001','owner'),('a1000000-0000-4000-8000-000000000002','owner');
insert into public.cards(id,issuer,name,card_type,searchable_text) values
 ('b1000000-0000-4000-8000-000000000001','Synthetic','Ledger test','credit_card','synthetic ledger');
insert into public.user_cards(id,owner_id,card_id) values
 ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001');
insert into public.card_rule_versions(id,card_id,version_label,version_order,source_url,effective_from,checked_on,verification_status,publication_status,policy_json)
values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Synthetic policy',1,'https://example.test/policy','2026-01-01','2026-01-01','verified','published',
'{"schemaVersion":1,"performanceScopes":[{"key":"spend","contributorSlots":["self","partner"],"basis":"gross","exclusions":[],"tiers":[{"key":"base","minimumSpend":300000}]}],"quotas":[{"key":"shared","sharing":{"kind":"shared","contributorSlots":["self","partner"]},"limit":{"kind":"fixed","amount":100}}],"benefits":[{"key":"base","benefitKind":"discount","reward":{"kind":"percent","basisPoints":1000,"rounding":"floor"},"performance":{"kind":"none"},"conditions":[],"recognitionBasis":"gross","quotaKeys":["shared"],"transactionLimit":null}],"cancellation":{"kind":"verified_original_month_net_replay"}}');
create function pg_temp.note(id uuid, tx uuid, basis bigint) returns jsonb language sql as $$
 select jsonb_build_object('kind','annotation.create','id',id,'source',jsonb_build_object('transaction_id',tx,'target_kind','confirmed_benefit','target_key','base','scope_instance_key',null,'amount',50,'basis_auto_amount',10,'basis_input_revision',basis::text,'basis_rule_version_id','b2000000-0000-4000-8000-000000000001'))
$$;
create function pg_temp.binding(id uuid, target uuid, contributor uuid, instance text) returns jsonb language sql as $$
 select jsonb_build_object('kind','membership.create','id',id,'source',jsonb_build_object('target_user_card_id',target,'contributor_user_card_id',contributor,'rule_version_id','b2000000-0000-4000-8000-000000000001','scope_kind','quota','scope_key','shared','contributor_slot','partner','scope_instance_key',instance,'valid_from_month','2026-01','valid_until_month',null))
$$;
create function pg_temp.purchase(id uuid, amount numeric default 1000) returns jsonb language sql as $$
 select jsonb_build_object('kind','transaction.create','id',id,'source',jsonb_build_object('occurred_at','2026-02-01T01:00:00Z','merchant_name','Synthetic purchase','amount',amount,'payment_method','credit_card','user_card_id','c1000000-0000-4000-8000-000000000001','payment_channel','unknown','installment_months',null,'ledger_category',null,'is_fixed_cost',false,'memo',null))
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.apply_ledger_command('d1000000-0000-4000-8000-000000000001',pg_temp.purchase('e1000000-0000-4000-8000-000000000001'))$$,'source command succeeds');
select is((select count(*)::int from public.transactions where id='e1000000-0000-4000-8000-000000000001'),1,'one source stored');
select is((select revision::text from public.owner_ledger_revisions),'1','source and owner revision committed together');
select lives_ok($$select public.apply_ledger_command('d1000000-0000-4000-8000-000000000001',pg_temp.purchase('e1000000-0000-4000-8000-000000000001'))$$,'lost response retry returns same receipt');
select is((select count(*)::int from public.ledger_mutation_log),1,'retry adds neither source nor audit');
select is((select after_source->'changes'->0->'after'->>'amount' from public.ledger_mutation_log),'1000','audit money is exact decimal text');
select throws_ok($$select public.apply_ledger_command('d1000000-0000-4000-8000-000000000001',pg_temp.purchase('e1000000-0000-4000-8000-000000000001',2000))$$,'22023',null,'same key different payload rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.purchase('e1000000-0000-4000-8000-000000000001'))$$,'23505',null,'new ID collision never upserts');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.purchase(gen_random_uuid(),1.25))$$,'22023',null,'fractional new KRW rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.purchase(gen_random_uuid()) || '{"owner_id":"a1000000-0000-4000-8000-000000000002"}'::jsonb)$$,'22023',null,'owner injection rejected');
select lives_ok($$select public.apply_ledger_command('d1000000-0000-4000-8000-000000000002','{"kind":"transaction.update","id":"e1000000-0000-4000-8000-000000000001","expected_version":"1","patch":{"memo":"corrected"}}')$$,'versioned edit succeeds');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"transaction.update","id":"e1000000-0000-4000-8000-000000000001","expected_version":"1","patch":{"memo":"stale"}}')$$,'40001',null,'stale form cannot overwrite newer entry');
select lives_ok($$select public.apply_ledger_command('d1000000-0000-4000-8000-000000000003','{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000001","source":{"transaction_id":"e1000000-0000-4000-8000-000000000001","amount":600,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}')$$,'future-month refund stored');
select is(jsonb_array_length(public.get_ledger_inputs('2026-02')->'inputs'->'adjustments'),1,'earlier snapshot includes later original-linked refund');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000002","source":{"transaction_id":"e1000000-0000-4000-8000-000000000001","amount":401,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}')$$,'23514',null,'cumulative active refunds cannot exceed original');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"transaction.update","id":"e1000000-0000-4000-8000-000000000001","expected_version":"2","patch":{"amount":500}}')$$,'23514',null,'purchase reduction cannot undercut refunds');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_build_object('kind','batch','commands',jsonb_build_array(pg_temp.purchase('e1000000-0000-4000-8000-000000000002'),'{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000002","source":{"transaction_id":"e1000000-0000-4000-8000-000000000002","amount":1001,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}'::jsonb)))$$,'23514',null,'failed child rolls back original plus refund');
select is((select count(*)::int from public.transactions where id='e1000000-0000-4000-8000-000000000002'),0,'batch original did not partially save');
select is((select count(*)::int from public.ledger_mutation_log),3,'failed batch did not append audit/revision');
select throws_ok($$update public.transactions set amount=1$$,'42501',null,'direct source update denied');
select throws_ok($$delete from public.user_cards$$,'42501',null,'direct card delete denied');
select throws_ok($$select public.set_default_user_card('a1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')$$,'42501',null,'old SECURITY DEFINER default RPC revoked');
select throws_ok($$select public.delete_user_card_and_promote_default('a1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')$$,'42501',null,'old SECURITY DEFINER delete RPC revoked');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(jsonb_array_length(public.get_ledger_inputs('2026-02')->'inputs'->'transactions'),0,'snapshot contains only authenticated owner');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000003","source":{"transaction_id":"e1000000-0000-4000-8000-000000000001","amount":1,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}')$$,'42501',null,'other owner cannot refund original');
reset role;
insert into public.transactions(owner_id,occurred_at,merchant_name,amount,actual_amount,final_amount,eligible_spend_amount,payment_method,user_card_id)
 select 'a1000000-0000-4000-8000-000000000001','2026-02-02T01:00:00Z','Synthetic bulk',1,1,1,1,'credit_card','c1000000-0000-4000-8000-000000000001' from generate_series(1,1000);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(public.get_ledger_inputs('2026-02')->'inputs'->'transactions'),1001,'aggregate snapshot has all 1001 sources');
-- Independent source, refund, and annotation IDs may refer to a newly created purchase.
select lives_ok($$select public.apply_ledger_command('d1000000-0000-4000-8000-000000000010',jsonb_build_object('kind','batch','commands',jsonb_build_array(
 pg_temp.purchase('e1000000-0000-4000-8000-000000000010'),
 '{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000010","source":{"transaction_id":"e1000000-0000-4000-8000-000000000010","amount":100,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}'::jsonb,
 pg_temp.note('f2000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000010',(select revision from public.owner_ledger_revisions)))))$$,'source + refund + annotation commits as one request');
select is((select count(*)::int from public.ledger_mutation_log where request_id='d1000000-0000-4000-8000-000000000010'),1,'batch has one audit');
select is((select cardinality(result_ids) from public.ledger_mutation_log where request_id='d1000000-0000-4000-8000-000000000010'),3,'distinct source entries retained');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_build_object('kind','batch','commands',jsonb_build_array(
 pg_temp.purchase('e1000000-0000-4000-8000-000000000011'),
 pg_temp.note('f2000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000011',0))))$$,'40001',null,'stale annotation basis rolls back the whole batch');
select is((select count(*)::int from public.transactions where id='e1000000-0000-4000-8000-000000000011'),0,'annotation failure leaves no partial source');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"batch","commands":[{"kind":"transaction.update","id":"e1000000-0000-4000-8000-000000000010","expected_version":"1","patch":{"memo":"first"}},{"kind":"transaction.update","id":"e1000000-0000-4000-8000-000000000010","expected_version":"2","patch":{"memo":"second"}}]}')$$,'22023',null,'same actual entry cannot mutate twice');
select is((select version::text from public.transactions where id='e1000000-0000-4000-8000-000000000010'),'1','duplicate mutation rollback retains original version');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"batch","commands":[{"kind":"batch","commands":[]}]}')$$,'22023',null,'nested batch denied');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_build_object('kind','batch','commands',(select jsonb_agg(pg_temp.purchase(gen_random_uuid())) from generate_series(1,101))))$$,'22023',null,'batch over 100 denied');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.purchase(gen_random_uuid()),'{source,benefit_amount}','5'))$$,'22023',null,'derived source column injection denied');
select throws_ok($$select public.ledger_apply_entry('a1000000-0000-4000-8000-000000000001',0,pg_temp.purchase(gen_random_uuid()))$$,'42501',null,'internal writer EXECUTE denied');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"card.create","id":"c1000000-0000-4000-8000-000000000002","source":{"card_id":"b1000000-0000-4000-8000-000000000001","alias":null}}')$$,'another owned card instance can be registered');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"card.default","id":"c1000000-0000-4000-8000-000000000002","expected_version":"1"}')$$,'default uses versioned command');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"card.default","id":"c1000000-0000-4000-8000-000000000001","expected_version":"1"}')$$,'default changes both affected entries');
select is((select version::text from public.user_cards where id='c1000000-0000-4000-8000-000000000002'),'3','implicit default removal increments version');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"batch","commands":[{"kind":"card.default","id":"c1000000-0000-4000-8000-000000000002","expected_version":"3"},{"kind":"card.archive","id":"c1000000-0000-4000-8000-000000000001","expected_version":"3"}]}')$$,'22023',null,'implicit card changes count as duplicate entries');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.binding('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','synthetic:shared'))$$,'direct shared binding accepted');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.binding('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','synthetic:shared'))$$,'matching direct contributor set accepted');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.binding(gen_random_uuid(),'c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','synthetic:shared'),'{source,contributor_slot}','"unknown"'))$$,'23514',null,'undeclared contributor slot denied');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"month_input.create","id":"c3000000-0000-4000-8000-000000000001","source":{"month":"2026-01","scopeKind":"performance","scopeKey":"spend","scopeInstanceKey":"card:c1000000-0000-4000-8000-000000000001:performance:spend","data":{"status":"manual_total","amount":12345}}}')$$,'manual scope total is a source command');
select is((select amount::text from public.card_month_inputs where id='c3000000-0000-4000-8000-000000000001'),'12345','manual scope amount is preserved, never replay-rewritten');
-- Legacy decimals and opaque historical snapshots survive read-only transport unchanged in DB.
reset role;
insert into public.transactions(id,owner_id,occurred_at,merchant_name,amount,actual_amount,final_amount,eligible_spend_amount,payment_method,user_card_id)
values('e1000000-0000-4000-8000-000000000099','a1000000-0000-4000-8000-000000000001','2026-02-02T01:00:00Z','Synthetic legacy',1.25,1.25,1.25,1.25,'credit_card','c1000000-0000-4000-8000-000000000001');
insert into public.transaction_annotations(id,owner_id,transaction_id,target_kind,amount,origin,review_status,legacy_snapshot)
values('f2000000-0000-4000-8000-000000000099','a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000099','confirmed_benefit',0.125,'legacy_manual','needs_review','{"rawAmount":9007199254740993.125}');
set local role authenticated;
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"transaction.update","id":"e1000000-0000-4000-8000-000000000099","expected_version":"1","patch":{"memo":"legacy memo only"}}')$$,'memo edit does not round legacy money');
select is((select amount::text from public.transactions where id='e1000000-0000-4000-8000-000000000099'),'1.25','legacy decimal still exact in DB');
select is((select n->'legacy_snapshot'->>'rawAmount' from jsonb_array_elements(public.get_ledger_inputs('2026-02')->'inputs'->'annotations') n where n->>'id'='f2000000-0000-4000-8000-000000000099'),'9007199254740993.125','nested raw history is lossless decimal text');
select is((select review_status from public.transaction_annotations where id='f2000000-0000-4000-8000-000000000099'),'needs_review','read does not resolve legacy annotation');
reset role;
insert into public.transactions(id,owner_id,occurred_at,merchant_name,amount,actual_amount,final_amount,eligible_spend_amount,payment_method,user_card_id)
values('e1000000-0000-4000-8000-000000000098','a1000000-0000-4000-8000-000000000001','2026-02-02T01:00:00Z','Synthetic unequal legacy principal',2000,1000,1000,1000,'credit_card','c1000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000098","source":{"transaction_id":"e1000000-0000-4000-8000-000000000098","amount":600,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}')$$,'partial legacy refund uses actual payment principal');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"refund.create","id":"f1000000-0000-4000-8000-000000000097","source":{"transaction_id":"e1000000-0000-4000-8000-000000000098","amount":401,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}')$$,'23514',null,'refund above actual_amount is rejected even below display amount');
select is((select amount::text||'/'||actual_amount::text from public.transactions where id='e1000000-0000-4000-8000-000000000098'),'2000/1000','both unequal legacy source amounts remain unchanged');
reset role;
update public.app_members set is_active=false where user_id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.get_ledger_inputs('2026-02'),null::jsonb,'revoked member cannot read snapshot');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.purchase(gen_random_uuid()))$$,'42501',null,'revoked member cannot mutate');
reset role;
select * from finish();
rollback;
