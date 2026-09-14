-- NOT EXECUTED in Task14: no disposable PostgreSQL/Supabase tools or isolated DB.
-- Run ONLY against an explicitly disposable database after all migrations (or schema.sql):
-- psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/household-income.test.sql
-- Synthetic fixtures only; never substitute a linked/production database.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('a1400000-0000-4000-8000-000000000001','income-one@moniq.test','authenticated','authenticated'),
 ('a1400000-0000-4000-8000-000000000002','income-two@moniq.test','authenticated','authenticated');
insert into public.app_members(user_id,role) values
 ('a1400000-0000-4000-8000-000000000001','owner'),('a1400000-0000-4000-8000-000000000002','owner');
create function pg_temp.income(id uuid, amount numeric default 3000000, occurred text default '2026-02-01T01:00:00Z') returns jsonb language sql as $$
 select jsonb_build_object('kind','income.create','id',id,'source',jsonb_build_object('occurred_at',occurred,'source_name','Synthetic salary','amount',amount,'ledger_category','salary','memo',null))
$$;
create function pg_temp.purchase(id uuid) returns jsonb language sql as $$
 select jsonb_build_object('kind','transaction.create','id',id,'source',jsonb_build_object('occurred_at','2026-02-01T01:00:00Z','merchant_name','Synthetic expense','amount',1000,'payment_method','cash','user_card_id',null,'payment_channel','unknown','installment_months',null,'ledger_category',null,'is_fixed_cost',false,'memo',null))
$$;
-- Fix round1 cases were authored before the SQL change; NOT EXECUTED here.
-- Explicit ECMAScript WhiteSpace + LineTerminator characters, not POSIX \s.
create function pg_temp.income_trim_cases() returns table(label text, chars text) language sql as $$
 values ('tab',U&'\0009'),('LF',U&'\000A'),('VT',U&'\000B'),('FF',U&'\000C'),('CR',U&'\000D'),
 ('space',U&'\0020'),('NBSP',U&'\00A0'),('OGHAM SPACE MARK',U&'\1680'),
 ('EN QUAD',U&'\2000'),('EM QUAD',U&'\2001'),('EN SPACE',U&'\2002'),('EM SPACE',U&'\2003'),
 ('THREE-PER-EM SPACE',U&'\2004'),('FOUR-PER-EM SPACE',U&'\2005'),('SIX-PER-EM SPACE',U&'\2006'),
 ('FIGURE SPACE',U&'\2007'),('PUNCTUATION SPACE',U&'\2008'),('THIN SPACE',U&'\2009'),('HAIR SPACE',U&'\200A'),
 ('LINE SEPARATOR',U&'\2028'),('PARAGRAPH SEPARATOR',U&'\2029'),('NARROW NBSP',U&'\202F'),
 ('MEDIUM MATHEMATICAL SPACE',U&'\205F'),('IDEOGRAPHIC SPACE',U&'\3000'),('BOM',U&'\FEFF'),
 ('mixed boundaries',U&'\0009\000A\00A0\FEFF\2028\3000')
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_ledger_inputs('2026-02')->'household','{"version":1,"incomes":[]}'::jsonb,'empty income is explicitly supported, not missing');
select is(public.apply_ledger_command('d1400000-0000-4000-8000-000000000001',pg_temp.income('e1400000-0000-4000-8000-000000000001')),
 '{"requestId":"d1400000-0000-4000-8000-000000000001","ownerRevision":"1","resultIds":["e1400000-0000-4000-8000-000000000001"],"replayed":false}'::jsonb,'income uses the existing atomic receipt');
select is((select count(*)::int from public.income_entries),1,'one separate income row');
select is((select count(*)::int from public.transactions),0,'income does not become a card transaction');
select is(public.apply_ledger_command('d1400000-0000-4000-8000-000000000001',pg_temp.income('e1400000-0000-4000-8000-000000000001'))->>'replayed','true','same UUID and payload replays its receipt');
select is((select count(*)::int from public.ledger_mutation_log),1,'retry adds no audit');
select is((select revision::text from public.owner_ledger_revisions),'1','retry does not increment revision');
select is((select after_source->'changes'->0->>'table' from public.ledger_mutation_log),'income_entries','audit identifies the separate source table');
select is((select after_source->'changes'->0->'after'->'amount' from public.ledger_mutation_log),'"3000000"'::jsonb,'audit amount uses lossless serializer');
select is(public.get_ledger_inputs('2026-02')->'household'->'incomes'->0->'amount','"3000000"'::jsonb,'snapshot preserves numeric source as decimal text');
select is(jsonb_typeof(public.get_ledger_inputs('2026-02')->'household'->'incomes'->0->'stable_sequence'),'string','snapshot sequence is not a JS number');
select is(public.get_ledger_inputs('2026-02')->'household'->'incomes'->0->'version','"1"'::jsonb,'snapshot entry version is text');
select throws_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000001',pg_temp.income('e1400000-0000-4000-8000-000000000001',1))$$,'22023',null,'same UUID with changed payload rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income('e1400000-0000-4000-8000-000000000001'))$$,'23505',null,'another request never upserts an existing income ID');
select throws_ok(format('select public.apply_ledger_command(gen_random_uuid(),pg_temp.income(gen_random_uuid(),%L::numeric))',amount),'22023',null,'invalid new income amount '||amount)
 from unnest(array['0','-1','0.5','9007199254740992']) amount;
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),'{source,amount}','"1000"'))$$,'22023',null,'numeric string is not a new integer amount');
select throws_ok(format('select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),%L::text[],%L::jsonb))',array['source',key],to_jsonb('injected'::text)),'22023',null,'source injection rejected: '||key)
 from unnest(array['owner_id','id','version','stable_sequence','input_excluded','user_card_id','payment_method','benefit_amount','actual_amount']) key;
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income(gen_random_uuid())||'{"owner_id":"a1400000-0000-4000-8000-000000000002"}')$$,'22023',null,'envelope owner injection rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),'{source,source_name}','" "'))$$,'22023',null,'blank source name rejected');
select throws_ok(format('select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),%L::text[],to_jsonb(%L::text)))',array['source','source_name'],chars),'22023',null,'income create rejects whitespace-only: '||label)
 from pg_temp.income_trim_cases();
select throws_ok(format('select public.apply_ledger_command(gen_random_uuid(),%L::jsonb)',jsonb_build_object('kind','income.update','id','e1400000-0000-4000-8000-000000000001','expected_version','1','patch',jsonb_build_object('source_name',chars))),'22023',null,'income update rejects whitespace-only: '||label)
 from pg_temp.income_trim_cases();
select is((select source_name from public.income_entries where id='e1400000-0000-4000-8000-000000000001'),'Synthetic salary','rejected whitespace updates preserve source');
select is((select version::text from public.income_entries where id='e1400000-0000-4000-8000-000000000001'),'1','rejected whitespace updates preserve version');
select is((select revision::text from public.owner_ledger_revisions),'1','whitespace rejections do not advance owner revision');
select is((select count(*)::int from public.ledger_mutation_log),1,'whitespace rejections do not append audit');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),'{source,source_name}',to_jsonb(repeat('a',201))))$$,'22023',null,'source name length bounded');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),'{source,ledger_category}',to_jsonb(repeat('a',121))))$$,'22023',null,'category length bounded');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),jsonb_set(pg_temp.income(gen_random_uuid()),'{source,memo}',to_jsonb(repeat('a',2001))))$$,'22023',null,'memo length bounded');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income(gen_random_uuid(),1,'not-an-instant'))$$,'22023',null,'invalid occurrence rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"income.update","id":"e1400000-0000-4000-8000-000000000001","expected_version":"1","patch":{}}')$$,'22023',null,'empty update rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"income.update","id":"e1400000-0000-4000-8000-000000000001","expected_version":"1","patch":{"benefit_amount":1}}')$$,'22023',null,'patch cannot inject card benefits');
select lives_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000002','{"kind":"income.update","id":"e1400000-0000-4000-8000-000000000001","expected_version":"1","patch":{"source_name":"Synthetic bonus","amount":9007199254740991,"ledger_category":null,"memo":"corrected"}}')$$,'partial income edit commits');
select is((select version::text from public.income_entries),'2','edit increments entry version');
select is((select amount::text from public.income_entries),'9007199254740991','safe integer maximum remains exact');
select is((select occurred_at from public.income_entries),'2026-02-01T01:00:00Z'::timestamptz,'partial patch preserves occurrence');
select is((select after_source->'changes'->0->'after'->'stable_sequence'=before_source->'changes'->0->'before'->'stable_sequence' from public.ledger_mutation_log where request_id='d1400000-0000-4000-8000-000000000002'),true,'edit preserves ordering identity');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"income.update","id":"e1400000-0000-4000-8000-000000000001","expected_version":"1","patch":{"memo":"stale"}}')$$,'40001',null,'stale version rejected');
select lives_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000003','{"kind":"income.exclude","id":"e1400000-0000-4000-8000-000000000001","expected_version":"2","excluded":true}')$$,'income exclusion is versioned');
select is(public.get_ledger_inputs('2026-02')->'household'->'incomes'->0->'input_excluded','true'::jsonb,'excluded row is preserved in raw snapshot');
select lives_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000004','{"kind":"income.exclude","id":"e1400000-0000-4000-8000-000000000001","expected_version":"3","excluded":false}')$$,'income can be restored');
select is((select version::text from public.income_entries),'4','restoration increments version');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"income.exclude","id":"e1400000-0000-4000-8000-000000000001","expected_version":"4","excluded":"true"}')$$,'22023',null,'exclusion flag requires JSON boolean');
select throws_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000010',jsonb_build_object('kind','batch','commands',jsonb_build_array(
 pg_temp.income('e1400000-0000-4000-8000-000000000010'),pg_temp.purchase('e1400000-0000-4000-8000-000000000010'),
 '{"kind":"refund.create","id":"f1400000-0000-4000-8000-000000000010","source":{"transaction_id":"e1400000-0000-4000-8000-000000000010","amount":1001,"occurred_at":"2026-03-01T01:00:00Z","memo":null}}'::jsonb)))$$,'23514',null,'refund cap failure rolls back mixed income/expense batch');
select is((select count(*)::int from public.income_entries where id='e1400000-0000-4000-8000-000000000010'),0,'failed batch leaves no income');
select is((select count(*)::int from public.transactions),0,'failed batch leaves no expense');
select is((select count(*)::int from public.transaction_adjustments),0,'failed batch leaves no refund');
select is((select count(*)::int from public.ledger_mutation_log),4,'failed batch leaves no audit');
select is((select revision::text from public.owner_ledger_revisions),'4','failed batch leaves revision unchanged');
select lives_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000011',jsonb_build_object('kind','batch','commands',jsonb_build_array(pg_temp.income('e1400000-0000-4000-8000-000000000011'),pg_temp.purchase('e1400000-0000-4000-8000-000000000011'))))$$,'finite dispatch allows the same UUID in distinct income and expense tables');
select is((select jsonb_array_length(after_source->'changes') from public.ledger_mutation_log where request_id='d1400000-0000-4000-8000-000000000011'),2,'mixed batch audits both source identities');
select is((select revision::text from public.owner_ledger_revisions),'5','mixed batch increments revision once');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"batch","commands":[{"kind":"income.update","id":"e1400000-0000-4000-8000-000000000001","expected_version":"4","patch":{"memo":"first"}},{"kind":"income.exclude","id":"e1400000-0000-4000-8000-000000000001","expected_version":"5","excluded":true}]}')$$,'22023',null,'duplicate income mutation rolls back');
select is((select version::text from public.income_entries where id='e1400000-0000-4000-8000-000000000001'),'4','duplicate batch leaves original version');
select throws_ok($$insert into public.income_entries(owner_id,occurred_at,source_name,amount) values(auth.uid(),now(),'Direct',1)$$,'42501',null,'direct income insert denied');
select throws_ok($$update public.income_entries set amount=1$$,'42501',null,'direct income update denied');
select throws_ok($$delete from public.income_entries$$,'42501',null,'direct income delete denied');
select throws_ok($$select public.ledger_apply_entry(auth.uid(),5,pg_temp.income(gen_random_uuid()))$$,'42501',null,'internal finite dispatcher not directly callable');
select throws_ok($$select nextval('public.ledger_stable_sequence')$$,'42501',null,'API role cannot forge source ordering');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income('e1400000-0000-4000-8000-000000000020',1,'2026-01-01T00:00:00+09:00'))$$,'earlier income stored');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income('e1400000-0000-4000-8000-000000000021',2,'2026-02-28T14:59:59.999Z'))$$,'last Seoul February instant stored');
select lives_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income('e1400000-0000-4000-8000-000000000022',3,'2026-02-28T15:00:00Z'))$$,'next Seoul month income still saves');
select is(jsonb_array_length(public.get_ledger_inputs('2026-02')->'household'->'incomes'),4,'snapshot includes all prior incomes but excludes next-month boundary');
select is(public.get_ledger_inputs('2026-02')->'household'->'incomes'->0->>'id','e1400000-0000-4000-8000-000000000020','snapshot orders chronologically, not by creation');
select is(public.get_ledger_inputs('2026-02')->'household'->'incomes'->1->>'id','e1400000-0000-4000-8000-000000000001','same instant rows use stable sequence');
select is(public.get_ledger_inputs('2026-02')->'household'->'incomes'->3->>'id','e1400000-0000-4000-8000-000000000021','month end row remains included');
select is(jsonb_array_length(public.get_ledger_inputs('2026-03')->'household'->'incomes'),5,'next-month row appears in its month');
select is(jsonb_array_length(public.get_ledger_inputs('2026-02')->'inputs'->'transactions'),1,'income support never alters card input count');
select set_config('request.jwt.claims','{"sub":"a1400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.income_entries),0,'RLS hides other owner incomes');
select is(public.get_ledger_inputs('2026-02')->'household','{"version":1,"incomes":[]}'::jsonb,'snapshot cannot leak other owner rows');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"income.update","id":"e1400000-0000-4000-8000-000000000001","expected_version":"4","patch":{"memo":"other owner"}}')$$,'42501',null,'other owner update rejected');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),'{"kind":"income.exclude","id":"e1400000-0000-4000-8000-000000000001","expected_version":"4","excluded":true}')$$,'42501',null,'other owner exclusion rejected');
reset role;
-- Privileged fixture writes test table constraints/identity, not an API bypass grant.
select throws_ok(format('insert into public.income_entries(owner_id,occurred_at,source_name,amount) values(%L,now(),%L,1)','a1400000-0000-4000-8000-000000000001',chars),'23514',null,'table CHECK rejects whitespace-only insert: '||label)
 from pg_temp.income_trim_cases();
select throws_ok(format('update public.income_entries set source_name=%L where id=%L',chars,'e1400000-0000-4000-8000-000000000001'),'23514',null,'table CHECK rejects whitespace-only update: '||label)
 from pg_temp.income_trim_cases();
select is(public.ledger_income_trim_source_name(chars||'Synthetic salary'||chars),'Synthetic salary','helper trims both boundaries: '||label)
 from pg_temp.income_trim_cases();
select is(public.ledger_income_trim_source_name(chars),chars,'helper does not trim non-ECMAScript character: '||label)
 from (values ('NEXT LINE',U&'\0085'),('MONGOLIAN VOWEL SEPARATOR',U&'\180E'),('ZERO WIDTH SPACE',U&'\200B'),('WORD JOINER',U&'\2060')) cases(label,chars);
select lives_ok($$insert into public.income_entries(owner_id,occurred_at,source_name,amount) values('a1400000-0000-4000-8000-000000000001',now(),repeat('a',200),1)$$,'table CHECK permits 200-character income source');
select throws_ok($$insert into public.income_entries(owner_id,occurred_at,source_name,amount) values('a1400000-0000-4000-8000-000000000001',now(),U&'\00A0\FEFF'||repeat('a',201)||U&'\0009\000A',1)$$,'23514',null,'table CHECK rejects overlong content after boundary trim');
select throws_ok($$insert into public.income_entries(owner_id,occurred_at,source_name,amount) values('a1400000-0000-4000-8000-000000000099',now(),'Unknown owner',1)$$,'23503',null,'income owner must exist');
select throws_ok(format('insert into public.income_entries(owner_id,occurred_at,source_name,amount) values(%L,now(),%L,%L::numeric)','a1400000-0000-4000-8000-000000000001','Bad amount',amount),'23514',null,'table enforces integer range: '||amount)
 from unnest(array['0','-1','0.5','9007199254740992','Infinity','NaN']) amount;
select throws_ok($$update public.income_entries set id=gen_random_uuid() where id='e1400000-0000-4000-8000-000000000001'$$,'23514',null,'income ID immutable');
select throws_ok($$update public.income_entries set owner_id='a1400000-0000-4000-8000-000000000002' where id='e1400000-0000-4000-8000-000000000001'$$,'23514',null,'income owner immutable');
select throws_ok($$update public.income_entries set stable_sequence=stable_sequence+100000 where id='e1400000-0000-4000-8000-000000000001'$$,'23514',null,'income sequence immutable');
select throws_ok($$update public.transactions set origin='legacy' where id='e1400000-0000-4000-8000-000000000011'$$,'23514',null,'shared identity trigger still protects transaction origin');
insert into public.income_entries(id,owner_id,occurred_at,source_name,amount,stable_sequence)
 values('e1400000-0000-4000-8000-000000000030','a1400000-0000-4000-8000-000000000001','2026-02-01T01:00:00Z','Sequence fixture',1,-1);
select ok((select stable_sequence>0 from public.income_entries where id='e1400000-0000-4000-8000-000000000030'),'insert trigger replaces caller-supplied ordering');
update public.app_members set is_active=false where user_id='a1400000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.income_entries),0,'membership revocation hides direct income reads');
select is(public.get_ledger_inputs('2026-02'),null::jsonb,'revoked owner cannot read snapshot');
select throws_ok($$select public.apply_ledger_command(gen_random_uuid(),pg_temp.income(gen_random_uuid()))$$,'42501',null,'revoked owner cannot create income');
select throws_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000001',pg_temp.income('e1400000-0000-4000-8000-000000000001'))$$,'42501',null,'membership is checked before old receipt replay');
reset role;
set local role anon;
select throws_ok($$select * from public.income_entries$$,'42501',null,'anonymous income read denied');
select throws_ok($$select public.get_ledger_inputs('2026-02')$$,'42501',null,'anonymous snapshot RPC denied');
reset role;
-- Successful normalization checks come after earlier count/revision assertions.
update public.app_members set is_active=true where user_id='a1400000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000040',jsonb_set(pg_temp.income('e1400000-0000-4000-8000-000000000040'),'{source,source_name}',to_jsonb((select string_agg(chars,'' order by label) from pg_temp.income_trim_cases())||repeat('a',200)||(select string_agg(chars,'' order by label) from pg_temp.income_trim_cases()))))$$,'income create trims every ECMAScript boundary before length validation and storage');
select is((select source_name from public.income_entries where id='e1400000-0000-4000-8000-000000000040'),repeat('a',200),'create stores only trimmed 200-character content');
select is((select after_source->'changes'->0->'after'->>'source_name' from public.ledger_mutation_log where request_id='d1400000-0000-4000-8000-000000000040'),repeat('a',200),'create audit stores normalized content');
select lives_ok($$select public.apply_ledger_command('d1400000-0000-4000-8000-000000000041',jsonb_build_object('kind','income.update','id','e1400000-0000-4000-8000-000000000040','expected_version','1','patch',jsonb_build_object('source_name',(select string_agg(chars,'' order by label) from pg_temp.income_trim_cases())||U&'\200BSynthetic\0009salary\0085'||(select string_agg(chars,'' order by label) from pg_temp.income_trim_cases()))))$$,'income update trims boundaries while retaining internal tab and non-trim characters');
select is((select source_name from public.income_entries where id='e1400000-0000-4000-8000-000000000040'),U&'\200BSynthetic\0009salary\0085','update stores JavaScript trim-equivalent content');
select is((select version::text from public.income_entries where id='e1400000-0000-4000-8000-000000000040'),'2','normalized update remains versioned');
select is((select after_source->'changes'->0->'after'->>'source_name' from public.ledger_mutation_log where request_id='d1400000-0000-4000-8000-000000000041'),U&'\200BSynthetic\0009salary\0085','update audit uses normalized content');
select throws_ok($$select public.ledger_income_trim_source_name('not a public RPC')$$,'42501',null,'authenticated cannot execute internal income trim helper');
reset role;
set local role anon;
select throws_ok($$select public.ledger_income_trim_source_name('not a public RPC')$$,'42501',null,'anonymous cannot execute internal income trim helper');
reset role;
set local role service_role;
select throws_ok($$select public.ledger_income_trim_source_name('not a public RPC')$$,'42501',null,'service role cannot execute internal income trim helper');
select throws_ok($$insert into public.income_entries(owner_id,occurred_at,source_name,amount) values('a1400000-0000-4000-8000-000000000001',now(),'Direct',1)$$,'42501',null,'income direct DML stays revoked for service role');
reset role;
select * from finish();
rollback;
