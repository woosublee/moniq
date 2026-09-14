# Moniq 외부 사용자 MVP 카드 가계부 설계

## 목표

3개월 MVP의 목표는 외부 사용자가 Moniq의 가치를 즉시 이해하고, 실제 자기 카드와 거래로 사용할 수 있는 수준의 제품을 만드는 것이다.

Moniq는 단순 카드 혜택 앱이 아니라 가계부 입력을 기반으로 카드별 실적과 혜택을 자동 계산해주는 서비스다. 사용자는 “어디서, 무슨 카드로, 얼마 썼는지”를 입력하고, Moniq가 분류·실적·혜택 계산을 처리한다.

## 제품 범위

### 핵심 사용자 가치

거래 생성 화면은 다음 필드 중심으로 단순화한다.

- 사용처
- 카드
- 금액
- 날짜

시스템은 다음 값을 자동으로 채운다.

- 가맹점 정규화
- 가계부 카테고리
- 혜택 적용 여부
- 혜택 금액
- 최종 체감 금액
- 실적 인정 금액
- 실적 제외 여부
- 실적 제외 사유

상세 수정 화면에서는 자동 계산된 값을 사용자가 조정할 수 있다.

### 외부 사용자 흐름

초기 화면은 두 가지 경로를 제공한다.

- 데모로 보기
- 내 카드로 시작하기

데모 모드는 로그인 없이 샘플 데이터를 보여준다. 샘플 데이터에는 샘플 카드, 거래, 카드별 실적 진행률, 받은 혜택, 실적 제외 거래, 거래별 적용 혜택이 포함된다.

실제 사용자는 Supabase Auth로 로그인한 뒤 카드 검색, 내 카드 추가, 거래 입력, 카드별 실적/혜택 확인 흐름을 사용한다.

### 카드 데이터 범위

카드 데이터는 두 계층으로 운영한다.

1. 계산 지원 카드
   - 초기 5~10개 대표 카드
   - 실적 기준, 실적 제외 조건, 주요 혜택 rule, 월 한도, 거래당 한도, 가맹점/category 매칭 조건을 정확히 관리한다.
2. 계산 미지원 카드
   - 검색, 추가, 거래 입력은 가능하다.
   - 혜택/실적 계산은 제한적으로 표시한다.

계산 미지원 카드는 다음처럼 명확히 표시한다.

> 이 카드는 아직 혜택 계산을 지원하지 않습니다. 거래 기록과 카드별 지출 합계는 확인할 수 있어요.

### MVP에서 제외하는 것

- 일반 사용자용 혜택 rule 생성/수정
- 복잡한 어드민 UI
- 모든 카드의 정확한 혜택 계산
- 카드사 연동/자동 내역 수집
- LLM 기반 분류/추천
- 알림/푸시
- 포인트몰/마일리지 고급 계산

카드 혜택/실적 rule은 seed, migration, 또는 내부 관리 데이터로 운영한다.

## 데이터 모델과 계산 흐름

### 핵심 원칙

다음 개념을 분리한다.

- 사용자가 입력한 원본 거래
- 시스템이 정규화한 거래 정보
- 카드 rule 기반 계산 결과
- 사용자가 나중에 수정한 값

이 분리는 계산 결과의 설명 가능성과 수동 수정 처리에 필요하다.

### 사용자/세션

MVP에서는 세 가지 owner context를 둔다.

- 로그인 사용자: Supabase Auth user id
- 데모 사용자: 고정 demo owner
- 개발 fallback: `MONIQ_OWNER_ID`

앱 코드에서는 직접 `serverEnv.moniqOwnerId`에 의존하지 않고 `getOwnerContext()` 같은 추상화를 통해 owner를 얻는다.

예상 반환값은 다음과 같다.

```ts
{
  ownerId: string;
  mode: "authenticated" | "demo" | "development";
  canMutate: boolean;
}
```

MVP 데모는 read-only를 기본으로 한다. 데모에서 거래 입력 체험이 필요하면 mock 또는 로그인 유도로 처리한다.

### 카드 카탈로그

`cards`는 카드 자체의 기본 정보를 가진다.

현재 필드에 다음을 추가한다.

- `benefit_support_status`
- `benefit_summary`

`benefit_support_status`는 다음 상태를 가진다.

- `full`
- `partial`
- `none`

이를 통해 UI에서 계산 지원 여부를 보여준다.

### 사용자 카드

`user_cards`는 사용자가 카탈로그 카드 중 어떤 카드를 사용 중인지 나타낸다.

계산 rule은 `user_cards`가 아니라 `cards`에 연결한다.

즉, 카드 혜택/실적 rule은 카드 카탈로그 소속이고, 사용자 카드는 사용자의 보유 카드 연결이다.

### 거래

`transactions`는 사용자가 입력한 값과 시스템 계산 결과를 함께 가진다.

생성 시 필수 입력은 다음이다.

- 사용처명
- 카드
- 금액
- 발생일

시스템이 채우는 값은 다음이다.

- 정규화된 merchant
- ledger category
- 혜택명
- 혜택 금액
- 최종 금액
- 실적 인정 금액
- 실적 인정 여부
- 실적 제외 사유
- 계산 source/status

다음 필드를 추가한다.

- `merchant_id`
- `merchant_normalized_name`
- `performance_exclusion_reason`
- `calculation_status`

`calculation_status`는 다음 값을 가진다.

- `calculated`
- `unsupported_card`
- `no_matching_rule`
- `missing_performance`
- `manual_override`

### 거래 혜택 적용 기록

`transaction_benefit_applications`는 어떤 rule이 어떤 거래에 적용됐는지 기록한다.

역할은 다음과 같다.

- 적용된 rule id 저장
- 표시 label 저장
- 혜택 금액 저장
- 계산 snapshot 저장

계산 snapshot은 UI에서 설명 문구를 만들 때 사용한다.

### 카드 혜택 rule

`card_benefit_rules`는 현재 구조를 유지하되, MVP에서는 다음 필드 중심으로 제한한다.

- card id
- 혜택명
- 혜택 종류
- 계산 방식
- rate / fixed amount
- 최소 결제 금액
- 월 한도
- 거래당 한도
- 적용 merchant keywords
- 적용 ledger categories
- 제외 merchant keywords
- 제외 ledger categories
- 실적 필요 여부
- 우선순위
- 활성 여부
- 적용 기간

### 카드 실적 requirement

`card_performance_requirements`는 현재 구조를 유지한다.

필요한 개념은 다음이다.

- card id
- 요구 실적 금액
- 기간 타입
- 혜택 적용 기준 월 offset
- 시작일/종료일
- 활성 여부

### 실적 제외 rule

카드별 실적 제외 조건을 표현하기 위해 `card_performance_exclusion_rules`를 추가한다.

필드는 다음이다.

- card id
- label
- match merchant keywords
- match ledger categories
- exclude if benefit applied
- priority
- active
- starts_on
- ends_on

계산 결과는 거래에 반영한다.

```text
eligible_spend_amount = 0
performance_exclusion_reason = "상품권 구매는 실적에서 제외됩니다."
```

### Merchant/category rule

자동 분류를 위해 `merchant_rules`를 둔다.

필드는 다음이다.

- keyword
- normalized merchant name
- ledger category
- priority
- active

예시는 다음과 같다.

```text
STARBUCKS → 스타벅스 → 카페
스타벅스 → 스타벅스 → 카페
쿠팡 → 쿠팡 → 쇼핑
배달의민족 → 배달의민족 → 식비
```

### 거래 생성 계산 흐름

거래 생성 시 흐름은 다음과 같다.

1. 입력값 수신
2. 사용처 정규화
3. 가계부 카테고리 자동 분류
4. 카드 계산 지원 여부 확인
5. 실적 충족 여부 확인
6. 혜택 rule 매칭
7. 월 한도/거래당 한도 반영
8. 실적 인정/제외 rule 계산
9. transaction 저장
10. transaction_benefit_applications 저장

### 계산 결과 처리

카드가 계산 미지원이면 다음으로 저장한다.

```text
benefit_amount = 0
final_amount = amount
eligible_spend_amount = amount
calculation_status = unsupported_card
```

카드가 계산 지원인데 matching rule이 없으면 다음으로 저장한다.

```text
benefit_amount = 0
final_amount = amount
eligible_spend_amount = amount
calculation_status = no_matching_rule
```

혜택 rule이 적용되면 다음으로 저장한다.

```text
benefit_amount = calculated
final_amount = amount - benefit_amount
eligible_spend_amount = performance calculated amount
calculation_status = calculated
```

사용자가 상세 수정에서 자동 계산 값을 직접 바꾸면 다음으로 저장한다.

```text
calculation_status = manual_override
```

수동 수정된 거래는 자동 재계산 대상에서 제외하거나, 사용자 확인 후 재계산한다.

## 화면 구성과 UX

### 랜딩 / 시작 화면

랜딩은 다음 메시지를 전달한다.

```text
Moniq
카드 실적과 혜택을 자동 계산하는 가계부

어디서, 무슨 카드로, 얼마 썼는지만 입력하세요.
Moniq가 카드 실적과 혜택을 계산해드립니다.

[데모로 보기]
[내 카드로 시작하기]
```

### 홈 대시보드

홈 대시보드는 이번 달 상태를 요약한다.

- 이번 달 총 지출
- 이번 달 받은 혜택
- 카드별 실적 상태
- 실적 부족 카드
- 최근 거래
- 추천 액션

예시는 다음과 같다.

```text
이번 달 지출 842,000원
받은 혜택 18,400원

신한 Deep Dream: 270,000 / 300,000원
30,000원 남음
```

### 거래 빠른 입력

기본 거래 생성 필드는 다음으로 제한한다.

- 사용처
- 카드
- 금액
- 날짜

메모, 카테고리 직접 선택, 고정비 여부는 고급 옵션 또는 수정 화면에 둔다.

저장 후에는 계산 결과를 보여준다.

```text
거래가 추가되었습니다.

스타벅스 · 12,000원 · 신한 Deep Dream
카페 5% 할인 600원
실적 인정 12,000원
```

### 거래 목록

거래 row는 지출 내역과 계산 결과를 함께 보여준다.

```text
스타벅스
5월 27일 · 신한 Deep Dream · 카페
12,000원
혜택 600원 · 실적 인정 12,000원
```

표시 상태는 다음이다.

- 혜택 적용
- 혜택 없음
- 실적 제외
- 계산 미지원 카드
- 수동 수정됨

필터는 다음을 지원한다.

- 기간
- 카드
- 카테고리
- 계산 상태
- 실적 제외 여부

### 거래 상세/수정 화면

거래 상세/수정 화면은 자동 계산 결과를 확인하고 필요하면 수정하는 곳이다.

표시/수정 대상은 다음이다.

- 사용처
- 금액
- 날짜
- 카드
- 카테고리
- 혜택명
- 혜택 금액
- 최종 체감 금액
- 실적 인정 금액
- 실적 제외 사유
- 계산 상태
- 메모

자동 계산 필드와 수동 수정 필드를 구분한다.

수동 수정된 거래에는 다음 상태를 표시한다.

```text
수동 수정됨
이 거래는 자동 재계산에서 제외됩니다.
```

### 내 카드 화면

카드 목록에서는 다음을 보여준다.

- 실적 진행률
- 남은 실적
- 이번 달 혜택 합계
- 계산 지원 상태
- 주요 혜택 요약

예시는 다음과 같다.

```text
신한 Deep Dream
이번 달 실적 270,000 / 300,000원
30,000원 남음
이번 달 혜택 8,200원
주요 혜택: 카페, 편의점, 대중교통
```

계산 미지원 카드는 다음처럼 표시한다.

```text
현대카드 M
혜택 계산 준비 중
이번 달 지출 124,000원
```

### 카드 검색/추가

검색 결과에는 계산 지원 상태를 표시한다.

```text
신한 Deep Dream
신한카드 · 신용카드
혜택 계산 지원
카페/편의점/대중교통
```

상태 문구는 다음 중 하나다.

- 혜택 계산 지원
- 일부 혜택 지원
- 계산 준비 중

### 카드 상세 화면

카드 상세는 더쎈카드형 가치가 가장 잘 보이는 화면이다.

구성은 다음이다.

- 이번 달 실적 진행률
- 남은 실적
- 이번 달 혜택 합계
- 실적 인정 거래
- 실적 제외 거래
- 실적 제외 사유별 합계
- 혜택별 받은 금액
- 월 한도 사용량
- 해당 카드 최근 거래

예시는 다음과 같다.

```text
카페 5% 할인
3,400 / 10,000원 사용
남은 한도 6,600원
```

### 카드 추천 / 인사이트

MVP에서는 과하게 만들지 않는다. 1차 추천은 거래 저장 후 또는 홈 대시보드에서 제공한다.

예시는 다음과 같다.

```text
다음부터 스타벅스에서는 신한 Deep Dream이 가장 유리해요.
예상 혜택 600원
```

또는:

```text
이 카드는 30,000원만 더 쓰면 다음 달 혜택 조건을 충족해요.
```

### 어드민성 화면

일반 사용자에게는 노출하지 않는다. MVP에서는 어드민 UI보다 seed SQL, migration, 내부 JSON/TS 데이터, 계산 테스트로 관리한다.

## 3개월 마일스톤

### Month 1. 입력 UX, 인증, 계산 기반

목표는 사용자가 로그인하거나 데모로 들어와 쉽게 거래를 입력하고 기본 계산 결과를 보는 것이다.

#### M1-1. Auth / owner 구조 전환

- Supabase Auth 도입
- 로그인 사용자별 `owner_id` 분리
- 현재 `MONIQ_OWNER_ID` 단일 구조를 auth 기반으로 전환
- read-only 데모 owner 추가
- 데모 모드는 read-only 기본

완료 기준:

- 로그인 사용자는 자기 카드/거래만 본다.
- 데모 사용자는 샘플 데이터만 본다.
- 로그아웃/비로그인 상태가 명확하다.

#### M1-2. 거래 입력 단순화

- 생성 필드를 사용처, 카드, 금액, 날짜 중심으로 축소
- 상세 값은 생성 시 숨김
- 상세 수정 기능은 유지
- 거래 추가 후 계산 결과 표시

완료 기준:

- 사용자는 4개 값만으로 거래를 추가할 수 있다.
- 거래 추가 후 계산 결과가 표시된다.
- 기존 상세 수정 기능은 유지된다.

#### M1-3. Merchant/category 자동 분류

- merchant rule seed 추가
- 사용처명 정규화
- ledger category 자동 설정
- 분류 실패 시 `기타` 처리
- 수정 화면에서 category 변경 가능

완료 기준:

- 스타벅스, 쿠팡, 배민, 편의점, 대중교통 정도는 자동 분류된다.
- 동일 merchant의 다른 표기도 같은 이름으로 묶인다.

#### M1-4. 계산 상태 모델 추가

- 거래별 `calculation_status` 추가
- 거래별 `performance_exclusion_reason` 추가
- UI에서 계산 미지원, 혜택 없음, 수동 수정 상태 구분

완료 기준:

- 거래별 계산 상태가 저장된다.
- UI에서 계산 미지원/혜택 없음/수동 수정 상태를 구분할 수 있다.

#### M1-5. 대표 카드 계산 seed 확장

- 5~10개 대표 카드 선정
- 각 카드에 실적/혜택 rule 입력
- 주요 merchant/category에 대한 혜택 rule 추가
- 계산 미지원 카드에는 support status 표시

완료 기준:

- 대표 카드 거래는 혜택/실적 계산이 동작한다.
- 미지원 카드는 명확히 계산 준비 중으로 표시된다.

### Month 2. 카드별 실적/혜택 대시보드

목표는 사용자가 이번 달 카드 상태를 한눈에 이해하는 것이다.

#### M2-1. 홈 대시보드 개선

- 이번 달 총 지출
- 이번 달 받은 혜택
- 카드별 실적 진행률
- 실적 부족 카드
- 최근 거래
- 간단한 추천 액션

완료 기준:

- 데모 사용자가 랜딩 후 바로 제품 가치를 이해할 수 있다.
- 로그인 사용자도 자기 데이터로 동일한 정보를 본다.

#### M2-2. 내 카드 화면 개선

- 실적 진행률
- 남은 실적
- 이번 달 혜택 합계
- 계산 지원 상태
- 주요 혜택 요약

완료 기준:

- 카드 목록만 봐도 어떤 카드가 실적을 채웠는지 알 수 있다.
- 계산 미지원 카드가 혼동 없이 표시된다.

#### M2-3. 카드 상세 페이지

- 실적 진행률
- 실적 인정 거래
- 실적 제외 거래
- 실적 제외 사유별 합계
- 혜택별 받은 금액
- 월 한도 사용량
- 해당 카드 최근 거래

완료 기준:

- 사용자는 특정 카드의 실적/혜택 상태를 설명 가능한 수준으로 확인할 수 있다.

#### M2-4. 거래 목록 개선

- 적용 혜택
- 혜택 금액
- 실적 인정 금액
- 실적 제외 여부
- 계산 상태
- 기간/카드/카테고리/계산 상태/실적 제외 필터

완료 기준:

- 거래 목록이 단순 지출 내역이 아니라 카드 혜택 계산 결과까지 보여준다.

### Month 3. 신뢰도, 추천, 외부 공개 준비

목표는 외부 사용자에게 보여줄 수 있는 안정성과 완성도를 갖추는 것이다.

#### M3-1. 계산 설명 UI

- 거래 상세 또는 카드 상세에서 계산 근거 표시
- 계산 snapshot 기반 설명 렌더링

완료 기준:

- 사용자가 왜 이 혜택/실적 결과가 나왔는지 이해할 수 있다.

#### M3-2. 실적 제외 rule 강화

- 카드별 실적 제외 rule 추가
- 실적 제외 사유 저장
- 카드 상세에서 제외 사유별 금액 표시

완료 기준:

- 결제 금액과 실적 인정 금액이 다른 케이스를 명확히 설명한다.

#### M3-3. 간단한 카드 추천/인사이트

- 거래 저장 후 또는 홈 대시보드에서 추천 표시
- 특정 사용처에서 더 유리한 카드 제안
- 실적까지 얼마 남았는지 안내

완료 기준:

- 사용자가 다음 행동을 하나 이상 얻을 수 있다.

#### M3-4. 데모 완성도

- 샘플 카드
- 샘플 거래
- 실적 충족/미충족 카드
- 혜택 적용/미적용 거래
- 실적 제외 거래
- 계산 미지원 카드

완료 기준:

- 로그인하지 않아도 Moniq의 핵심 가치를 1분 안에 이해할 수 있다.

#### M3-5. 외부 공개 품질 점검

- 빈 상태 UI
- 에러 상태 UI
- 로딩 상태
- 모바일 화면
- 기본 접근성
- 계산 로직 테스트
- 주요 flow 수동 검증

완료 기준:

- 신규 사용자가 회원가입부터 첫 거래 입력까지 막히지 않는다.
- 데모 모드에서 핵심 화면이 모두 정상 동작한다.
- 계산 로직 주요 케이스가 테스트로 보장된다.

## 아키텍처

Moniq는 네 레이어로 나눈다.

```text
UI layer
  ↓
Application actions / queries
  ↓
Domain calculation modules
  ↓
Supabase data model
```

### UI layer

역할은 다음이다.

- 빠른 거래 입력
- 거래 목록/상세
- 카드 목록/상세
- 홈 대시보드
- 데모/로그인 진입

UI는 계산 로직을 직접 알지 않고 server action/query 결과만 표시한다.

### Application actions / queries

역할은 다음이다.

- 현재 owner context 확인
- 데모 모드인지 로그인 사용자인지 판단
- 거래 생성/수정/삭제
- 카드 추가/삭제/기본 카드 설정
- 필요한 데이터를 모아 domain calculation module에 전달

초기 구현에서 파일이 커지면 다음 단위로 분리한다.

```text
src/lib/auth/owner.ts
src/lib/supabase/queries/cards.ts
src/lib/supabase/queries/transactions.ts
src/lib/supabase/queries/card-benefits.ts
```

### Domain calculation modules

역할은 다음이다.

- merchant 정규화
- category 분류
- 혜택 rule matching
- 혜택 계산
- 실적 인정/제외 계산
- 계산 snapshot 생성
- 설명에 필요한 structured data 생성

계산 도메인은 다음 구조로 둔다.

```text
src/features/merchants/
  normalize.ts
  types.ts

src/features/card-benefits/
  calculation.ts
  performance.ts
  rule-matching.ts
  explanations.ts
  types.ts

src/features/transactions/
  calculation.ts
  mappers.ts
  validation.ts
```

계산 module은 Supabase client를 직접 알지 않는다. 입력 데이터와 rule을 받아 순수 함수에 가깝게 동작해야 한다.

### Supabase data model

Supabase는 사용자별 거래/카드, 카드 카탈로그, 카드 혜택/실적 rule, 계산 결과 snapshot을 저장한다.

## Auth / Demo 경계

모든 사용자 데이터 쿼리는 owner context를 통해 접근한다.

```text
logged-in user → auth user id
demo mode → read-only demo owner id
dev fallback → MONIQ_OWNER_ID
```

MVP는 read-only 데모와 로그인 유도로 구현한다.

## 사용자 입력과 자동 계산 경계

### 생성

거래 생성 입력은 다음이다.

- `merchant_name`
- `user_card_id`
- `amount`
- `occurred_at`

서버가 자동 계산하는 값은 다음이다.

- `merchant_normalized_name`
- `ledger_category`
- `benefit_label`
- `benefit_amount`
- `final_amount`
- `eligible_spend_amount`
- `is_performance_eligible`
- `performance_exclusion_reason`
- `calculation_status`
- `transaction_benefit_applications`

### 수정

수정에는 자동 재계산과 수동 수정이 있다.

사용처, 카드, 금액, 날짜가 바뀌면 기본적으로 재계산한다. 사용자가 혜택 금액이나 실적 인정 금액을 직접 바꾸면 `calculation_status = manual_override`로 저장한다.

## 계산 실패/불완전 데이터 처리

계산이 불완전한 상태는 명확히 표시한다.

상태는 다음이다.

- `calculated`
- `unsupported_card`
- `no_matching_rule`
- `missing_performance`
- `manual_override`

문구 예시는 다음이다.

```text
이 카드는 아직 혜택 계산을 지원하지 않습니다.
거래 기록과 카드별 지출 합계는 확인할 수 있어요.
```

```text
적용 가능한 혜택이 없습니다.
```

```text
전월 실적 조건을 충족하지 않아 혜택이 적용되지 않았습니다.
```

```text
이 거래는 수동으로 수정되었습니다.
```

## 보안/RLS 방향

외부 사용자 MVP에서는 RLS가 필수다.

### Public catalog

다음은 모든 사용자가 읽을 수 있다.

- `cards`
- `card_benefit_rules`
- `card_performance_requirements`
- `merchant_rules`

쓰기는 관리자만 가능해야 한다.

### Private user data

다음은 사용자 본인만 접근해야 한다.

- `user_cards`
- `transactions`
- `transaction_benefit_applications`

RLS 정책은 `owner_id = auth.uid()` 기반으로 전환한다.

데모 데이터는 demo owner에 귀속된 데이터로 저장하고, 데모 모드에서는 읽기만 허용한다.

## 테스트/검증 전략

### 단위 테스트

계산 로직의 필수 케이스는 다음이다.

- 정률 할인
- 정액 할인
- 최소 결제 금액 미달
- 월 한도 초과
- 거래당 한도
- 실적 미충족
- 실적 제외 거래
- 계산 미지원 카드
- rule 미매칭
- manual override

### 통합 또는 수동 검증

주요 flow는 다음이다.

1. 회원가입/로그인
2. 카드 추가
3. 빠른 거래 입력
4. 계산 결과 확인
5. 카드 상세 실적 확인
6. 거래 수정
7. 데모 모드 진입

### UI 검증

외부 MVP 기준에서 반드시 확인한다.

- 모바일 화면
- 빈 상태
- 에러 상태
- 로딩 상태
- 계산 미지원 카드 표시
- 데모 모드에서 핵심 화면 정상 노출

## 범위 관리

정확 계산 대상은 대표 카드 5~10개로 제한한다. 카드 카탈로그는 더 넓게 노출할 수 있다.

다음은 제외한다.

- 카드사 연동
- 일반 사용자 rule 관리
- 복잡한 어드민
- LLM 분류

## 성공 기준

3개월 후 MVP는 다음이 가능해야 한다.

1. 사용자가 데모로 핵심 가치를 1분 안에 이해한다.
2. 사용자가 로그인해서 내 카드를 추가한다.
3. 사용자가 간단한 거래를 입력한다.
4. 시스템이 카테고리, 혜택, 실적 인정 금액을 자동 계산한다.
5. 사용자가 카드별 실적과 받은 혜택을 확인한다.
6. 계산 미지원 카드도 혼동 없이 사용할 수 있다.
7. 대표 카드 5~10개는 신뢰 가능한 수준으로 계산된다.
8. 계산 결과의 근거를 설명할 수 있다.
