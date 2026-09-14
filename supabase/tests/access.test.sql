-- Final-schema access fixtures, after ALL migrations (or fresh schema.sql).
-- Synthetic A/B, revoked and nonmember accounts only. Task10 execution pending.
-- Direct DML and legacy RPC privileges were removed by ledger_commands.
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'active-owner@moniq.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'revoked-owner@moniq.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'other-owner@moniq.test', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'nonmember@moniq.test', 'authenticated', 'authenticated');

insert into public.app_members (user_id, role, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'owner', true),
  ('22222222-2222-4222-8222-222222222222', 'owner', false),
  ('33333333-3333-4333-8333-333333333333', 'owner', true);

insert into public.cards (id, issuer, name, card_type, searchable_text)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Test', 'Active One', 'credit_card', 'active one'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Test', 'Active Two', 'credit_card', 'active two'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Test', 'Active Three', 'credit_card', 'active three'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Test', 'Other', 'credit_card', 'other'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Test', 'Revoked', 'credit_card', 'revoked'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Test', 'Nonmember', 'credit_card', 'nonmember');

insert into public.user_cards (id, owner_id, card_id, alias, is_default)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'active one', true),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'active two', false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'active three', false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', '33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'other', true),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4', '22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'revoked', true),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5', '44444444-4444-4444-8444-444444444444', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'nonmember', true);

insert into public.transactions (
  id,
  owner_id,
  occurred_at,
  merchant_name,
  amount,
  actual_amount,
  benefit_amount,
  final_amount,
  eligible_spend_amount,
  payment_method,
  user_card_id
)
values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', '11111111-1111-4111-8111-111111111111', now(), 'Active merchant', 1000, 1000, 0, 1000, 1000, 'credit_card', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', '33333333-3333-4333-8333-333333333333', now(), 'Other merchant', 1000, 1000, 0, 1000, 1000, 'credit_card', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', '22222222-2222-4222-8222-222222222222', now(), 'Revoked merchant', 1000, 1000, 0, 1000, 1000, 'credit_card', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff4', '44444444-4444-4444-8444-444444444444', now(), 'Nonmember merchant', 1000, 1000, 0, 1000, 1000, 'credit_card', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5');

insert into public.transaction_benefit_applications (
  id,
  transaction_id,
  owner_id,
  user_card_id,
  source,
  benefit_amount,
  eligible_spend_amount
)
values
  ('90000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-fffffffffff1', '11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'auto', 0, 1000),
  ('90000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-fffffffffff2', '33333333-3333-4333-8333-333333333333', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'auto', 0, 1000),
  ('90000000-0000-4000-8000-000000000003', 'ffffffff-ffff-4fff-8fff-fffffffffff3', '22222222-2222-4222-8222-222222222222', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4', 'auto', 0, 1000);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is((select count(*)::integer from public.app_members), 1, 'active member can read only their membership');
select is((select count(*)::integer from public.app_members where user_id = '33333333-3333-4333-8333-333333333333'), 0, 'member cannot read another membership');
select throws_ok(
  $$insert into public.app_members (user_id, role, is_active) values ('44444444-4444-4444-8444-444444444444', 'owner', true)$$,
  '42501',
  'permission denied for table app_members',
  'authenticated users cannot manage membership'
);
select is((select count(*)::integer from public.user_cards), 3, 'active member can read their user cards');
select is((select count(*)::integer from public.user_cards where owner_id = '33333333-3333-4333-8333-333333333333'), 0, 'active member cannot read another owner user card');
select is((select count(*)::integer from public.transactions), 1, 'active member can read their transactions');
select is((select count(*)::integer from public.transaction_benefit_applications), 1, 'active member can read their benefit applications');
select throws_ok(
  $$insert into public.transactions (owner_id, occurred_at, merchant_name, amount, actual_amount, final_amount, eligible_spend_amount, payment_method) values ('11111111-1111-4111-8111-111111111111', now(), 'Denied direct write', 1000, 1000, 1000, 1000, 'cash')$$,
  '42501', 'permission denied for table transactions',
  'even active members must write through the atomic command'
);
select throws_ok(
  $$insert into public.transactions (owner_id, occurred_at, merchant_name, amount, actual_amount, final_amount, eligible_spend_amount, payment_method) values ('33333333-3333-4333-8333-333333333333', now(), 'Denied', 1000, 1000, 1000, 1000, 'cash')$$,
  '42501',
  'permission denied for table transactions',
  'active member cannot insert another owner transaction'
);
select throws_ok(
  $$select public.set_default_user_card('11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2')$$,
  '42501', null, 'legacy default-card RPC is not a bypass'
);
select throws_ok(
  $$select public.delete_user_card_and_promote_default('11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2')$$,
  '42501', null, 'legacy delete-card RPC is not a bypass'
);
select lives_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000001', '{"kind":"card.default","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2","expected_version":"1"}')$$,
  'active member changes their default through the atomic command'
);
select is((select is_default from public.user_cards where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'), true, 'default command changes the intended owned card');
select throws_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000002', '{"kind":"card.default","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3","expected_version":"1"}')$$,
  '42501', null, 'command rejects another owner card reference'
);
select lives_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000003', '{"kind":"card.archive","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2","expected_version":"2"}')$$,
  'active member archives their card through the atomic command'
);
select ok((select archived_at is not null from public.user_cards where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'), 'archive preserves the card and its history');
select throws_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000004', '{"kind":"card.archive","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3","expected_version":"1"}')$$,
  '42501', null, 'archive rejects another owner card reference'
);
select is((select count(*)::integer from public.ledger_mutation_log), 2, 'only the two successful owned commands append audit records');

reset role;
update public.user_cards
set is_default = false
where owner_id = '11111111-1111-4111-8111-111111111111';
update public.user_cards
set is_default = true
where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
update public.app_members
set is_active = false
where user_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is(public.get_ledger_inputs('2026-02'), null::jsonb, 'same JWT loses snapshot access immediately after membership revocation');
select throws_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000005', '{"kind":"card.default","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6","expected_version":"1"}')$$,
  '42501', null, 'default command rejects the same JWT after membership revocation'
);
select throws_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000006', '{"kind":"card.archive","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6","expected_version":"1"}')$$,
  '42501', null, 'archive command rejects the same JWT after membership revocation'
);

reset role;
select is(
  (select is_default from public.user_cards where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6'),
  false,
  'revoked default-card RPC attempt preserves the default state'
);
select is(
  (select count(*)::integer from public.user_cards where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6'),
  1,
  'revoked delete-card RPC attempt preserves the user card'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select is((select count(*)::integer from public.user_cards), 0, 'revoked member cannot read personal cards');
select is((select count(*)::integer from public.transactions), 0, 'revoked member cannot read transactions');
select throws_ok(
  $$insert into public.transactions (owner_id, occurred_at, merchant_name, amount, actual_amount, final_amount, eligible_spend_amount, payment_method) values ('22222222-2222-4222-8222-222222222222', now(), 'Denied', 1000, 1000, 1000, 1000, 'cash')$$,
  '42501',
  'permission denied for table transactions',
  'revoked member cannot insert a transaction'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select is((select count(*)::integer from public.user_cards), 0, 'nonmember cannot read personal cards');
select is(public.get_ledger_inputs('2026-02'), null::jsonb, 'nonmember cannot read an aggregate snapshot');
select throws_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000007', '{"kind":"card.default","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5","expected_version":"1"}')$$,
  '42501', null, 'auth user with owned legacy data but no membership cannot mutate'
);
select throws_ok(
  $$insert into public.transactions (owner_id, occurred_at, merchant_name, amount, actual_amount, final_amount, eligible_spend_amount, payment_method) values ('44444444-4444-4444-8444-444444444444', now(), 'Denied', 1000, 1000, 1000, 1000, 'cash')$$,
  '42501',
  'permission denied for table transactions',
  'nonmember cannot insert a transaction'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select * from public.user_cards$$,
  '42501',
  'permission denied for table user_cards',
  'unauthenticated user cannot read personal cards'
);
select throws_ok(
  $$select * from public.transactions$$,
  '42501',
  'permission denied for table transactions',
  'unauthenticated user cannot read transactions'
);
select throws_ok(
  $$select * from public.transaction_benefit_applications$$,
  '42501',
  'permission denied for table transaction_benefit_applications',
  'unauthenticated user cannot read benefit applications'
);
select throws_ok(
  $$select public.set_default_user_card('11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1')$$,
  '42501',
  'permission denied for function set_default_user_card',
  'unauthenticated user cannot execute the default-card RPC'
);

select throws_ok($$select public.get_ledger_inputs('2026-02')$$, '42501', null, 'anonymous snapshot RPC is denied');
select throws_ok(
  $$select public.apply_ledger_command('91000000-0000-4000-8000-000000000008', '{"kind":"card.default","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1","expected_version":"1"}')$$,
  '42501', null, 'anonymous mutation RPC is denied'
);
reset role;
select is((select count(*)::integer from public.ledger_mutation_log where owner_id='11111111-1111-4111-8111-111111111111'), 2, 'denied and revoked attempts preserve audit count');
select * from finish();
rollback;
