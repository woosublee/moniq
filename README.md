# Moniq

수입과 지출을 함께 기록하는 모바일 우선 개인 가계부이며, 카드 지출은 같은 원본으로 월 실적과 예상 혜택까지 자동 계산합니다. 마이데이터·불특정 공개 가입·광고·상품 추천은 포함하지 않습니다. 본인 사용을 먼저 검증하고 이후 승인한 사용자에게만 개방합니다.

## 현재 구현과 경계

- `/ledger`: 월·기간별 수입, 카드·현금 지출, 환불을 함께 보는 가계부. 검색·분류·결제수단·카드·종류 필터와 50건 페이지를 제공합니다.
- `/dashboard`: 가계부와 같은 선택 범위·원본으로 수입/지출/차액 및 분류·고정비 통계를 표시합니다. 예상 카드 혜택은 지출 원금에서 선차감하지 않습니다.
- `/cards?month=YYYY-MM&tab=performance|benefits|transactions`: 같은 카드 거래 원본의 실적 관리 / 혜택 관리 / 사용내역. 월·검색·카드·페이지 상태를 상세와 뒤로 가기까지 유지합니다.
- `/transactions/new`: `/ledger` 입력 dialog로 연결되는 호환 경로입니다. 거래 상세·수정, 원거래 연결 부분취소, 오입력 제외, 예상 고정·실제 확정·실적 보정을 유지합니다.
- 개인 데이터는 검증된 Supabase Auth 사용자와 활성 `app_members`가 있어야 접근합니다. 로그인 링크는 계정을 자동 생성하지 않습니다.
- DB의 단일 `get_ledger_inputs` snapshot → 순수 `replayLedger` → 가계부/통계/카드. 가계부는 승인 원금에서 발생월 환불을 빼고, 수입 원본은 카드 replay 입력과 분리합니다. 원본 쓰기는 `apply_ledger_command`의 source+audit 원자 RPC만 사용합니다. 사용자별 잠금·멱등 request UUID·entry version을 검증하도록 구현했습니다. **실제 SQL/RLS/경합 인수는 아직 미실행**입니다.
- `/demo`는 명시적 수입을 포함한 동일한 2026-02 생활 synthetic snapshot을 가계부/통계/카드에서 읽는 읽기 전용 소개입니다. 브라우저 form harness의 메모리 응답은 실제 인증·저장 증거가 아닙니다.
- 기존 DB는 `20260913103000_verified_card_policies.sql` 다음에 `20260913110000_household_income.sql`을 누적 적용해야 합니다. 새 migration은 기존 owner를 바꾸지 않고 owner별 수입 원본을 추가합니다. migration 전 구버전 snapshot은 수입을 0원으로 꾸미지 않고 `수입 기능 적용 필요`/`확인 필요`로 표시하며 수입 쓰기만 차단합니다. 적용 이력·owner 보존·실제 데이터 검증은 [개인 사용 설정](docs/private-use-setup.md)의 별도 실DB gate가 남아 있습니다.
- KB국민 탄탄대로 **Biz 티타늄(09184)** 및 **Miz&Mr 티타늄(09230)**은 공식 설명서 확보·부분 모델 구현 단계입니다. **효력기간·절사·운영 조건 미검증으로 비실행 candidate**이며 `published+verified`로 활성화하지 않습니다.

## 환경과 설치

Node.js **22 이상**이 필요합니다. Next 16.2.4 자체 최소값은 20.9지만 현재 lockfile의 `@supabase/supabase-js` 2.116.0은 Node 22 이상을 요구합니다. 최신 패치의 지원 중인 Node 22/24 계열을 우선 검토하세요. 이번 검증 환경은 Node 26.4.0 / npm 11.17.0이며 다른 Node 버전에서 통과했다고 간주하지 않습니다.

```sh
npm ci
```

새 clone 또는 별도 승인한 설치 환경에서만 실행합니다. 기존 검증 환경에서는 의존성을 재설치하지 않았습니다. 현재 의존성·보안 경고·DB 준비 절차는 [개인 사용 설정](docs/private-use-setup.md)을 먼저 확인하세요.

## 실제 환경 없이 검증하기

```sh
npm test
npm run lint
npm run verify:production
npm run typecheck
npm run test:e2e
```

- `verify:production`: 실제 production 소스를 allowlist로 gitignored `.superpowers/sdd/quirky-dreaming-quiche/task-8-build-*`에 복사하고 **원래 Next 설정으로 `npm run build -- --webpack`**을 실행합니다. 테스트/하네스 route/소스 mock을 넣지 않습니다. 설치 의존성만 symlink하고, 기존 `.next`, `next-env.d.ts`, 실제 `.env*`, `.supabase`는 읽거나 복사하지 않습니다. Next 기본 Turbopack 검증은 아닙니다.
- `typecheck`: 별도 `task-8-typecheck-*`에서 `next typegen` → `tsc --noEmit`. production route 타입과 `src` 단위 테스트·`e2e` 타입을 포함합니다. 오래된 원본 `.next`까지 포함한 루트 `tsc` 통과와 구분합니다.
- 두 명령은 가짜 loopback Supabase public 설정만 사용합니다. 빌드 산출물은 **배포용이 아닙니다**. 각 runtime의 `verification.json`에 복사된 파일 SHA-256과 명령/시간/exit code가 있습니다.
- E2E는 기존 `playwright.config.ts`, `scripts/task6-preview.mjs`, `e2e/*.spec.ts`와 설치된 **Google Chrome**을 사용합니다. 320/390/768/1440px synthetic 화면, 키보드, native form과 메모리 harness를 검증합니다. 실제 DB 로그인·저장 테스트가 아닙니다. 3106 포트가 비어 있어야 하며 기존 프로세스를 자동 종료하지 않습니다.
- E2E는 실행별 `browser-*`에 결과를 남깁니다. 필요하면 `npm run test:e2e -- --output=.superpowers/sdd/quirky-dreaming-quiche/새로운-실행명`으로 지정합니다. 기존 실행 폴더를 재사용하면 Playwright가 내용을 지울 수 있으므로 새 이름을 사용하세요.

읽기 전용 앱을 직접 조작하려면 다음 명령으로 실행하고 `http://localhost:3106/demo`를 엽니다. 종료는 이 명령의 터미널에서 Ctrl+C로 합니다.

```sh
npm run preview:synthetic
```

이 preview에만 `/task7-harness`가 추가됩니다. 임의 계정·키·인증 우회나 실DB 쓰기는 없습니다. 새 runtime 경로는 콘솔 및 해당 runtime의 `runtime-path.txt`에 남습니다.

## 승인된 실제 개발 환경

[개인 사용 설정](docs/private-use-setup.md)의 DB/계정/백업 gate를 통과한 후 `.env.example`의 public URL/key를 개인 `.env.local`에 설정합니다. service-role 키나 owner 환경변수는 앱에 넣지 않습니다.

```sh
npm run dev
# 승인된 깨끗한 build 환경에서만:
npm run build
npm run start
```

기본 주소는 `http://localhost:3000`입니다. 일반 `dev/build/typegen`은 해당 디렉터리의 `.next`와 `next-env.d.ts`를 생성·갱신하므로 기존 산출물을 보존해야 할 때는 위 격리 검증 명령을 사용하세요.

## 적용 전 필수 gate

1. **Task10 — 실제 DB 미완료:** Supabase/SQL 도구 준비, 격리 DB의 누적 migration 및 fresh schema 설치 비교, pgTAP/RLS/RPC/경합, 실제 synthetic 로그인·저장 인수. 현재 저장소에는 local Supabase `config.toml`도 제공하지 않으며 자동 초기화하지 않습니다.
2. **Task11 — 실제 카드 약관 미완료:** 기간·절사·실제 거래 조건·환불 등 검증 전 두 candidate 활성화 금지.
3. **보안 보수:** 2026-09-13 `npm audit`는 12개 영향 패키지(critical 2, high 7, moderate 2, low 1)를 보고했습니다. Next와 Vitest 관련 항목이 포함됩니다. 배포 전 적용 가능성과 수정판을 검토하고 별도 보수·회귀 검증해야 합니다. 자동 audit fix/업그레이드는 하지 않았습니다.
4. **별도 승인:** 실제 DB 적용, 첫 사용자/허용 등록, 기존 owner 이전, 계정 초대, 배포, commit/push는 구현 계획 승인에 포함되지 않습니다.

## 문서

- [2026-09-13 승인 제품 설계와 현재 계약](docs/superpowers/specs/2026-09-13-card-workspace-design.md)
- [개인 사용·DB 적용 준비와 검증 절차](docs/private-use-setup.md)
- [상품 출처와 조건 coverage](docs/card-rule-coverage.md)

2026-05-27 외부 공개 MVP 문서는 이전 참고 자료입니다. 현재 접근 범위와 계산 계약은 위 2026-09-13 문서를 따릅니다.
