insert into public.cards (id, issuer, name, card_type, network, annual_fee, searchable_text)
values
  ('11111111-1111-4111-8111-111111111101', '신한카드', 'Deep Dream', 'credit_card', 'VISA', 10000, '신한카드 Deep Dream deep dream visa 생활비 포인트 적립'),
  ('11111111-1111-4111-8111-111111111102', '삼성카드', 'taptap O', 'credit_card', 'MASTER', 10000, '삼성카드 taptap O taptap master 카페 통신 할인'),
  ('11111111-1111-4111-8111-111111111103', '현대카드', 'M CHECK', 'check_card', 'VISA', 0, '현대카드 M CHECK m check visa 체크카드 포인트'),
  ('11111111-1111-4111-8111-111111111104', 'KB국민카드', '탄탄대로 올쇼핑', 'credit_card', 'MASTER', 15000, 'KB국민카드 탄탄대로 올쇼핑 master 쇼핑 마트 할인'),
  ('11111111-1111-4111-8111-111111111105', '우리카드', 'DA@카드의정석', 'credit_card', 'VISA', 12000, '우리카드 DA 카드의정석 visa 무실적 할인'),
  ('11111111-1111-4111-8111-111111111106', '롯데카드', 'LOCA LIKIT', 'credit_card', 'MASTER', 10000, '롯데카드 LOCA LIKIT loca likit master 편의점 구독 할인'),
  ('11111111-1111-4111-8111-111111111107', '하나카드', 'MULTI Young', 'credit_card', 'VISA', 12000, '하나카드 MULTI Young multi young visa 대중교통 카페 할인')
on conflict (id) do update set
  issuer = excluded.issuer,
  name = excluded.name,
  card_type = excluded.card_type,
  network = excluded.network,
  annual_fee = excluded.annual_fee,
  searchable_text = excluded.searchable_text;

insert into public.user_cards (id, owner_id, card_id, alias, is_default, created_at)
values
  ('22222222-2222-4222-8222-222222222201', '00000000-0000-0000-0000-000000000001', '11111111-1111-4111-8111-111111111101', null, false, now() - interval '25 days'),
  ('22222222-2222-4222-8222-222222222202', '00000000-0000-0000-0000-000000000001', '11111111-1111-4111-8111-111111111102', null, false, now() - interval '24 days'),
  ('22222222-2222-4222-8222-222222222203', '00000000-0000-0000-0000-000000000001', '11111111-1111-4111-8111-111111111104', null, false, now() - interval '23 days'),
  ('22222222-2222-4222-8222-222222222204', '00000000-0000-0000-0000-000000000001', '11111111-1111-4111-8111-111111111107', null, false, now() - interval '22 days')
on conflict (id) do update set
  alias = excluded.alias,
  created_at = excluded.created_at;

delete from public.transactions
where owner_id = '00000000-0000-0000-0000-000000000001'
  and id in (
    '33333333-3333-4333-8333-333333333301',
    '33333333-3333-4333-8333-333333333302',
    '33333333-3333-4333-8333-333333333303',
    '33333333-3333-4333-8333-333333333304',
    '33333333-3333-4333-8333-333333333305',
    '33333333-3333-4333-8333-333333333306',
    '33333333-3333-4333-8333-333333333307',
    '33333333-3333-4333-8333-333333333308',
    '33333333-3333-4333-8333-333333333309',
    '33333333-3333-4333-8333-333333333310',
    '33333333-3333-4333-8333-333333333311',
    '33333333-3333-4333-8333-333333333312',
    '33333333-3333-4333-8333-333333333313',
    '33333333-3333-4333-8333-333333333314'
  );

insert into public.transactions (
  id,
  owner_id,
  occurred_at,
  merchant_name,
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
  ('33333333-3333-4333-8333-333333333301', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '1 day 08 hours 20 minutes', '스타벅스 강남R', 12800, 12800, '카페 20% 할인', 2560, 10240, 0, false, 'credit_card', '식비', false, '22222222-2222-4222-8222-222222222202', '혜택 적용 거래는 실적 제외', now() - interval '20 days'),
  ('33333333-3333-4333-8333-333333333302', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '2 days 19 hours 10 minutes', '이마트 성수점', 84200, 84200, '대형마트 5% 할인', 4210, 79990, 79990, true, 'credit_card', '생활비', false, '22222222-2222-4222-8222-222222222203', null, now() - interval '19 days'),
  ('33333333-3333-4333-8333-333333333303', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '3 days 12 hours', 'GS25 역삼점', 9600, 9600, '편의점 1,000원 청구할인', 1000, 8600, 8600, true, 'credit_card', '생활비', false, '22222222-2222-4222-8222-222222222201', null, now() - interval '18 days'),
  ('33333333-3333-4333-8333-333333333304', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '4 days 07 hours 40 minutes', '서울교통공사', 6200, 6200, '대중교통 10% 할인', 620, 5580, 5580, true, 'credit_card', '교통', false, '22222222-2222-4222-8222-222222222204', null, now() - interval '17 days'),
  ('33333333-3333-4333-8333-333333333305', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '5 days 09 hours', '쿠팡 로켓배송', 57300, 57300, '온라인 쇼핑 3% 적립', 1719, 55581, 57300, true, 'credit_card', '쇼핑', false, '22222222-2222-4222-8222-222222222203', '적립형 혜택은 실적 인정', now() - interval '16 days'),
  ('33333333-3333-4333-8333-333333333306', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '6 days 22 hours', '넷플릭스', 17000, 17000, '구독 2,000원 할인', 2000, 15000, 0, false, 'credit_card', '구독', true, '22222222-2222-4222-8222-222222222202', '혜택 적용 구독 결제 실적 제외', now() - interval '15 days'),
  ('33333333-3333-4333-8333-333333333307', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '7 days 13 hours 30 minutes', 'SKT 통신요금', 69000, 69000, '통신비 7,000원 할인', 7000, 62000, 62000, true, 'credit_card', '통신', true, '22222222-2222-4222-8222-222222222202', null, now() - interval '14 days'),
  ('33333333-3333-4333-8333-333333333308', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '8 days 18 hours 15 minutes', '동네약국', 18400, 18400, null, 0, 18400, 18400, true, 'check_card', '의료', false, null, null, now() - interval '13 days'),
  ('33333333-3333-4333-8333-333333333309', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '10 days 12 hours 10 minutes', '김밥천국', 8900, 8900, null, 0, 8900, 8900, true, 'cash', '식비', false, null, '현금 결제', now() - interval '12 days'),
  ('33333333-3333-4333-8333-333333333310', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '11 days 15 hours 45 minutes', '카카오T 택시', 16400, 16400, '모빌리티 5% 할인', 820, 15580, 15580, true, 'credit_card', '교통', false, '22222222-2222-4222-8222-222222222204', null, now() - interval '11 days'),
  ('33333333-3333-4333-8333-333333333311', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '13 days 20 hours', '올리브영', 37200, 37200, '드럭스토어 2,000원 할인', 2000, 35200, 0, false, 'credit_card', '쇼핑', false, '22222222-2222-4222-8222-222222222201', '할인 받은 건 실적 제외', now() - interval '10 days'),
  ('33333333-3333-4333-8333-333333333312', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '16 days 10 hours 5 minutes', '배달의민족', 28600, 28600, '배달앱 10% 할인', 2860, 25740, 25740, true, 'credit_card', '식비', false, '22222222-2222-4222-8222-222222222201', null, now() - interval '9 days'),
  ('33333333-3333-4333-8333-333333333313', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '18 days 21 hours 30 minutes', '관리비 자동이체', 145000, 145000, null, 0, 145000, 145000, true, 'credit_card', '주거', true, '22222222-2222-4222-8222-222222222201', '아파트 관리비', now() - interval '8 days'),
  ('33333333-3333-4333-8333-333333333314', '00000000-0000-0000-0000-000000000001', date_trunc('month', now()) + interval '20 days 14 hours 25 minutes', '네이버페이 포인트 결제', 12400, 12400, '포인트 사용', 12400, 0, 0, false, 'points', '쇼핑', false, null, '전액 포인트 사용', now() - interval '7 days');
