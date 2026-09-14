insert into public.cards (
  id,
  issuer,
  name,
  card_type,
  network,
  annual_fee,
  benefit_support_status,
  benefit_summary,
  searchable_text
)
values
  (
    '11111111-1111-4111-8111-111111111101',
    '신한카드',
    'Deep Dream',
    'credit_card',
    'VISA',
    10000,
    'full',
    '편의점 1,000원 청구할인, 배달앱 10% 할인',
    '신한카드 Deep Dream deep dream visa 생활비 포인트 적립 편의점 배달앱'
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    '삼성카드',
    'taptap O',
    'credit_card',
    'MASTER',
    10000,
    'full',
    '카페 20% 할인, 구독 2,000원 할인',
    '삼성카드 taptap O taptap master 카페 통신 할인 구독'
  ),
  (
    '11111111-1111-4111-8111-111111111104',
    'KB국민카드',
    '탄탄대로 올쇼핑',
    'credit_card',
    'MASTER',
    15000,
    'full',
    '대형마트 5% 할인, 온라인 쇼핑 3% 적립',
    'KB국민카드 탄탄대로 올쇼핑 master 쇼핑 마트 할인 온라인'
  ),
  (
    '11111111-1111-4111-8111-111111111199',
    '샘플카드',
    '계산 준비중 카드',
    'credit_card',
    'VISA',
    0,
    'none',
    '혜택 계산 준비 중',
    '샘플카드 계산 준비중 카드 visa 혜택 미지원'
  )
on conflict (id) do update set
  issuer = excluded.issuer,
  name = excluded.name,
  card_type = excluded.card_type,
  network = excluded.network,
  annual_fee = excluded.annual_fee,
  benefit_support_status = excluded.benefit_support_status,
  benefit_summary = excluded.benefit_summary,
  searchable_text = excluded.searchable_text;

insert into public.user_cards (id, owner_id, card_id, alias, is_default, created_at)
values
  (
    '22222222-2222-4222-8222-222222222901',
    '00000000-0000-0000-0000-000000000999',
    '11111111-1111-4111-8111-111111111102',
    '카페/구독 카드',
    true,
    now() - interval '10 days'
  ),
  (
    '22222222-2222-4222-8222-222222222902',
    '00000000-0000-0000-0000-000000000999',
    '11111111-1111-4111-8111-111111111101',
    '생활비 카드',
    false,
    now() - interval '9 days'
  ),
  (
    '22222222-2222-4222-8222-222222222903',
    '00000000-0000-0000-0000-000000000999',
    '11111111-1111-4111-8111-111111111104',
    '쇼핑 카드',
    false,
    now() - interval '8 days'
  ),
  (
    '22222222-2222-4222-8222-222222222904',
    '00000000-0000-0000-0000-000000000999',
    '11111111-1111-4111-8111-111111111199',
    '미지원 카드',
    false,
    now() - interval '7 days'
  )
on conflict (id) do update set
  owner_id = excluded.owner_id,
  card_id = excluded.card_id,
  alias = excluded.alias,
  is_default = excluded.is_default,
  created_at = excluded.created_at;

insert into public.merchant_rules (
  id,
  keyword,
  normalized_merchant_name,
  ledger_category,
  priority,
  is_active
)
values
  (
    '66666666-6666-4666-8666-666666666901',
    '스타벅스',
    '스타벅스',
    '식비',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666902',
    '동네문구',
    '동네문구',
    '기타',
    50,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666903',
    '넷플릭스',
    '넷플릭스',
    '구독',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666904',
    '오프라인서점',
    '오프라인서점',
    '문화',
    50,
    true
  )
on conflict (id) do update set
  keyword = excluded.keyword,
  normalized_merchant_name = excluded.normalized_merchant_name,
  ledger_category = excluded.ledger_category,
  priority = excluded.priority,
  is_active = excluded.is_active;

insert into public.card_performance_exclusion_rules (
  id,
  card_id,
  label,
  match_merchant_keywords,
  match_ledger_categories,
  exclude_if_benefit_applied,
  priority,
  is_active
)
values
  (
    '77777777-7777-4777-8777-777777777901',
    '11111111-1111-4111-8111-111111111102',
    '혜택 적용 거래 실적 제외',
    array[]::text[],
    array[]::text[],
    true,
    10,
    true
  )
on conflict (id) do update set
  card_id = excluded.card_id,
  label = excluded.label,
  match_merchant_keywords = excluded.match_merchant_keywords,
  match_ledger_categories = excluded.match_ledger_categories,
  exclude_if_benefit_applied = excluded.exclude_if_benefit_applied,
  priority = excluded.priority,
  is_active = excluded.is_active;

delete from public.transaction_benefit_applications
where owner_id = '00000000-0000-0000-0000-000000000999'
  and transaction_id in (
    '33333333-3333-4333-8333-333333333901',
    '33333333-3333-4333-8333-333333333902',
    '33333333-3333-4333-8333-333333333903',
    '33333333-3333-4333-8333-333333333904'
  );

delete from public.transactions
where owner_id = '00000000-0000-0000-0000-000000000999'
  and id in (
    '33333333-3333-4333-8333-333333333901',
    '33333333-3333-4333-8333-333333333902',
    '33333333-3333-4333-8333-333333333903',
    '33333333-3333-4333-8333-333333333904'
  );

insert into public.transactions (
  id,
  owner_id,
  occurred_at,
  merchant_name,
  merchant_normalized_name,
  performance_exclusion_reason,
  calculation_status,
  amount,
  actual_amount,
  benefit_label,
  benefit_amount,
  final_amount,
  eligible_spend_amount,
  is_performance_eligible,
  payment_method,
  ledger_category,
  is_fixed_cost,
  user_card_id,
  memo,
  created_at
)
values
  (
    '33333333-3333-4333-8333-333333333901',
    '00000000-0000-0000-0000-000000000999',
    date_trunc('month', now()) + interval '2 days 08 hours 20 minutes',
    '스타벅스 강남R',
    '스타벅스',
    null,
    'calculated',
    12000,
    12000,
    '카페 20% 할인',
    2400,
    9600,
    9600,
    true,
    'credit_card',
    '식비',
    false,
    '22222222-2222-4222-8222-222222222901',
    '혜택 적용 예시',
    now() - interval '4 days'
  ),
  (
    '33333333-3333-4333-8333-333333333902',
    '00000000-0000-0000-0000-000000000999',
    date_trunc('month', now()) + interval '3 days 13 hours',
    '동네문구',
    '동네문구',
    null,
    'no_matching_rule',
    18000,
    18000,
    null,
    0,
    18000,
    18000,
    true,
    'credit_card',
    '기타',
    false,
    '22222222-2222-4222-8222-222222222903',
    '매칭되는 혜택 없음',
    now() - interval '3 days'
  ),
  (
    '33333333-3333-4333-8333-333333333903',
    '00000000-0000-0000-0000-000000000999',
    date_trunc('month', now()) + interval '4 days 21 hours',
    '넷플릭스',
    '넷플릭스',
    '혜택 적용 거래 실적 제외',
    'calculated',
    17000,
    17000,
    '구독 2,000원 할인',
    2000,
    15000,
    0,
    false,
    'credit_card',
    '구독',
    true,
    '22222222-2222-4222-8222-222222222901',
    '혜택은 적용되지만 실적에서 제외되는 예시',
    now() - interval '2 days'
  ),
  (
    '33333333-3333-4333-8333-333333333904',
    '00000000-0000-0000-0000-000000000999',
    date_trunc('month', now()) + interval '5 days 15 hours 30 minutes',
    '오프라인서점',
    '오프라인서점',
    null,
    'unsupported_card',
    32000,
    32000,
    null,
    0,
    32000,
    32000,
    true,
    'credit_card',
    '문화',
    false,
    '22222222-2222-4222-8222-222222222904',
    '혜택 계산 미지원 카드 예시',
    now() - interval '1 day'
  );

insert into public.transaction_benefit_applications (
  id,
  transaction_id,
  owner_id,
  user_card_id,
  card_benefit_rule_id,
  label,
  source,
  benefit_amount,
  eligible_spend_amount,
  calculation_snapshot,
  created_at
)
values
  (
    '88888888-8888-4888-8888-888888888901',
    '33333333-3333-4333-8333-333333333901',
    '00000000-0000-0000-0000-000000000999',
    '22222222-2222-4222-8222-222222222901',
    '44444444-4444-4444-8444-444444444403',
    '카페 20% 할인',
    'auto',
    2400,
    9600,
    jsonb_build_object('demo_case', 'benefit_applied'),
    now() - interval '4 days'
  ),
  (
    '88888888-8888-4888-8888-888888888902',
    '33333333-3333-4333-8333-333333333903',
    '00000000-0000-0000-0000-000000000999',
    '22222222-2222-4222-8222-222222222901',
    '44444444-4444-4444-8444-444444444404',
    '구독 2,000원 할인',
    'auto',
    2000,
    0,
    jsonb_build_object('demo_case', 'performance_exclusion'),
    now() - interval '2 days'
  )
on conflict (id) do update set
  transaction_id = excluded.transaction_id,
  owner_id = excluded.owner_id,
  user_card_id = excluded.user_card_id,
  card_benefit_rule_id = excluded.card_benefit_rule_id,
  label = excluded.label,
  source = excluded.source,
  benefit_amount = excluded.benefit_amount,
  eligible_spend_amount = excluded.eligible_spend_amount,
  calculation_snapshot = excluded.calculation_snapshot,
  created_at = excluded.created_at;
