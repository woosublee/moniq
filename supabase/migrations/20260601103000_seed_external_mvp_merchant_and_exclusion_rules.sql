-- External MVP seed coverage for representative calculation rules.
update public.cards
set
  benefit_support_status = 'none',
  benefit_summary = '혜택 계산 준비 중'
where id in (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103',
  '11111111-1111-4111-8111-111111111104',
  '11111111-1111-4111-8111-111111111105',
  '11111111-1111-4111-8111-111111111106',
  '11111111-1111-4111-8111-111111111107',
  '11111111-1111-4111-8111-111111111199'
);

update public.cards
set
  benefit_support_status = 'full',
  benefit_summary = '편의점 1,000원 청구할인, 배달앱 10% 할인'
where id = '11111111-1111-4111-8111-111111111101';

update public.cards
set
  benefit_support_status = 'full',
  benefit_summary = '카페 20% 할인, 구독 2,000원 할인'
where id = '11111111-1111-4111-8111-111111111102';

update public.cards
set
  benefit_support_status = 'full',
  benefit_summary = '대형마트 5% 할인, 온라인 쇼핑 3% 적립'
where id = '11111111-1111-4111-8111-111111111104';

update public.cards
set
  benefit_support_status = 'partial',
  benefit_summary = '대중교통 10% 할인, 모빌리티 5% 할인'
where id = '11111111-1111-4111-8111-111111111107';

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
    '66666666-6666-4666-8666-666666666001',
    '스타벅스',
    '스타벅스',
    '카페',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666002',
    'STARBUCKS',
    '스타벅스',
    '카페',
    20,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666003',
    '쿠팡',
    '쿠팡',
    '쇼핑',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666004',
    '배달의민족',
    '배달의민족',
    '식비',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666005',
    '배민',
    '배달의민족',
    '식비',
    20,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666006',
    'GS25',
    'GS25',
    '편의점',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666007',
    'CU',
    'CU',
    '편의점',
    20,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666008',
    '지하철',
    '지하철',
    '교통',
    10,
    true
  ),
  (
    '66666666-6666-4666-8666-666666666009',
    '버스',
    '버스',
    '교통',
    20,
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
    '77777777-7777-4777-8777-777777777001',
    '11111111-1111-4111-8111-111111111101',
    '상품권 실적 제외',
    array[]::text[],
    array['상품권'],
    false,
    10,
    true
  ),
  (
    '77777777-7777-4777-8777-777777777002',
    '11111111-1111-4111-8111-111111111101',
    '세금/공과금 실적 제외',
    array[]::text[],
    array['세금/공과금'],
    false,
    20,
    true
  ),
  (
    '77777777-7777-4777-8777-777777777003',
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
