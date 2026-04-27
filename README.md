# Moniq

Moniq는 현금, 카드, 포인트를 함께 관리하면서 카드 혜택, 전월 실적, 남은 할인 한도를 규칙 기반으로 계산하는 가계부 서비스입니다.

## 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## Supabase 연결

### 1. Supabase 프로젝트 생성
- Supabase에서 새 프로젝트를 만듭니다.
- Project Settings → API에서 아래 값을 확인합니다.
  - `Project URL`
  - `anon public key`

### 2. 환경변수 설정
루트에 `.env.local` 파일을 만들고 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

예시는 `.env.example` 파일에 있습니다.

### 3. 테이블 생성
Supabase SQL Editor에서 아래 파일 내용을 실행합니다.

- `supabase/schema.sql`

이 스키마는 초기 `transactions` 테이블과 로컬 개발용 익명 insert/select 정책을 포함합니다.

## 현재 거래 입력 플로우
- 페이지: `/transactions/new`
- 저장 테이블: `public.transactions`
- 초기 저장 규칙:
  - `benefit_amount = 0`
  - `eligible_spend_amount = amount`

## 다음 단계
- 카드 관리 탭 추가
- 카드 혜택 계산 탭 분리
- merchant/category 정규화
- 전월 실적 계산 로직 추가
