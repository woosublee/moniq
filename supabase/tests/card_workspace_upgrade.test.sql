-- psql-only, disposable DB at 20260913090000_private_access, before Task 2.
-- Applies the migration inside a rolled-back transaction. NOT executed in Task 2.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into public.cards (id,issuer,name,card_type,searchable_text) values ('21000000-0000-4000-8000-000000000001','Synthetic','Upgrade','credit_card','upgrade');
insert into public.user_cards (id,owner_id,card_id) values ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001');
insert into public.transactions (id,owner_id,occurred_at,merchant_name,amount,actual_amount,benefit_amount,final_amount,eligible_spend_amount,payment_method,user_card_id) values
 ('51000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','2026-02-01','Fractional original',1000.55,1000.55,1.25,999.30,999.30,'credit_card','31000000-0000-4000-8000-000000000001'),
 ('51000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','2026-02-02','Unclear original',200.25,200.25,0,200.25,200.25,'cash',null);
insert into public.card_benefit_rules (id,card_id,name,benefit_kind,calculation_method,fixed_amount) values
 ('71000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Legacy seed','discount','fixed_amount',1.25);
insert into public.transaction_benefit_applications (id,transaction_id,owner_id,source,benefit_amount,eligible_spend_amount,calculation_snapshot) values
 ('81000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','manual',1.25,999.30,'{"legacy":"untouched","amount":"1000.55"}');
create temporary table original_transactions as select to_jsonb(t) as row from public.transactions t;
create temporary table original_applications as select to_jsonb(a) as row from public.transaction_benefit_applications a;
create temporary table original_rules as select to_jsonb(r) as row from public.card_benefit_rules r;

\ir ../migrations/20260913093000_card_workspace_models.sql

select ok(not exists(select 1 from original_transactions o where not exists(select 1 from public.transactions t where to_jsonb(t) @> o.row)), 'all pre-migration source fields and IDs remain unchanged');
select ok(not exists(select row from original_applications except select to_jsonb(a) from public.transaction_benefit_applications a), 'calculation snapshots and application money preserved');
select ok(not exists(select row from original_rules except select to_jsonb(r) from public.card_benefit_rules r), 'old policy seed rows untouched');
select is((select amount::text from public.transactions where id='51000000-0000-4000-8000-000000000001'),'1000.55','legacy fractional original never rounded');
select is((select amount::text from public.transaction_annotations where legacy_application_id='81000000-0000-4000-8000-000000000001' and target_kind='confirmed_benefit'),'1.25','explicit legacy manual benefit preserved separately');
select is((select amount::text from public.transaction_annotations where legacy_application_id='81000000-0000-4000-8000-000000000001' and target_kind='performance'),'999.30','explicit legacy recognized amount preserved separately');
select is((select review_status from public.transaction_annotations where legacy_application_id='81000000-0000-4000-8000-000000000001' and target_kind='confirmed_benefit'),'needs_review','legacy amount is not a confirmed observation until its review is resolved');
select is((select count(*)::int from public.transaction_annotations where transaction_id='51000000-0000-4000-8000-000000000002'),0,'ambiguous original does not invent manual intent');
select ok((select legacy_review_required from public.transactions where id='51000000-0000-4000-8000-000000000002'),'ambiguous legacy row marked for review');
select is((select verification_status from public.card_rule_versions where card_id='21000000-0000-4000-8000-000000000001' and version_order=0),'legacy_unverified','legacy seed never silently verified');
select ok((select legacy_snapshot is not null and policy_json is null from public.card_rule_versions where card_id='21000000-0000-4000-8000-000000000001' and version_order=0),'legacy seed kept as audit-only snapshot');
select lives_ok($$insert into public.user_cards (owner_id,card_id) values ('11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001')$$,'upgrade removes single-product ownership constraint');
select is((select user_card_id::text from public.transactions where id='51000000-0000-4000-8000-000000000001'),'31000000-0000-4000-8000-000000000001','existing transaction/card link unchanged');
select * from finish();
rollback;
