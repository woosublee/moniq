-- Task 5: PUBLIC PRODUCT METADATA ONLY. Despite the planned filename, this
-- migration publishes ZERO verified/executable policies. Effective dates and
-- rounding are unverified. Candidate conditions live in the application catalog.
-- No card_rule_versions, benefits, requirements, merchant rules, user_cards,
-- transactions, ownership, membership or account data is inserted/updated.
-- Not executed against any database as part of Task 5.
begin;

insert into public.cards (
  issuer, name, card_type, network, annual_fee, benefit_support_status,
  benefit_summary, searchable_text
)
select 'KB국민', product.name, 'credit_card', null, product.annual_fee, 'none',
  '공식 상품설명서 확보 · 일부 조건 모델 구현 · 적용 기간/절사 미검증으로 자동 계산 대기',
  product.searchable_text
from (values
  ('탄탄대로 Biz 티타늄카드', 40000,
   'KB국민 국민 탄탄대로 Biz 티타늄 카드 09184 포인트리',
   '탄탄대로biz티타늄'),
  ('탄탄대로 Miz&Mr 티타늄카드', 30000,
   'KB국민 국민 탄탄대로 Miz&Mr 미즈앤미스터 티타늄 카드 09230 청구할인',
   '탄탄대로miz&mr티타늄')
) as product(name, annual_fee, searchable_text, exact_name)
where not exists (
  select 1 from public.cards existing
  where lower(regexp_replace(existing.issuer, '\s', '', 'g')) in ('kb국민', 'kb국민카드', '국민', '국민카드')
    and regexp_replace(
      regexp_replace(lower(regexp_replace(existing.name, '\s', '', 'g')), '^kb국민', ''),
      '카드$', ''
    ) = product.exact_name
);

-- Intentionally no UPDATE of pre-existing products or their legacy rule rows.
-- The source/coverage display recognizes only exact issuer/product identities;
-- it does not promote a card's stale benefit_support_status to a verified policy.
commit;
