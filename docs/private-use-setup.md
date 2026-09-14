# 개인 사용 설정과 적용 준비

이 문서는 **실행 승인이나 적용 완료 기록이 아닙니다**. 본인 사용을 먼저 검증하고, 이후 별도 승인한 사용자만 허용합니다. 실제 연결정보·이메일·owner ID·원장을 문서/fixture/공개 데모에 넣지 않습니다.

## 1. 현재 runtime / 의존성

2026-09-13 설치된 `node_modules/*/package.json` 및 lockfile 대조 기준입니다.

| 항목 | 설치 버전 | 확인한 engine / 경계 |
|---|---|---|
| Node / npm | 26.4.0 / 11.17.0 | 이번 검증 runtime. 지원 중인 Node 22/24 최신 패치 사용을 우선 검토하되 그 환경 검증은 별도로 수행 |
| Next / React / React DOM | 16.2.4 / 19.2.4 / 19.2.4 | Next Node >=20.9.0, App Router/async cookies·searchParams/`src/proxy.ts` |
| Supabase JS / Auth JS | 2.116.0 / 2.116.0 | **Node >=22.0.0**. package.json 범위 `^2.104.1`만 보고 Node20을 선택하지 않음 |
| Supabase SSR | 0.12.7 | 사용자 세션 client; 앱에 service-role 키 불필요 |
| TypeScript / Vitest | 5.9.3 / 3.2.4 | 테스트와 production build/typegen 검증 분리 |
| Playwright / Tailwind / ESLint | 1.63.0 / 4.2.4 / 9.39.4 | 설치 Google Chrome 사용, DB/실기기 테스트 아님 |
| Supabase CLI / PostgreSQL / Docker | **확인 불가 — 실행 파일 없음** | 실제 서버 버전, CLI 버전, 확장 설치·호환성은 Task10에서 기록. 서버 버전을 추정하지 않음 |

앱의 `engines.node`는 `>=22.0.0`입니다. 설치는 새 clone/승인된 개발 환경에서 `npm ci`로 lockfile을 따릅니다. 이 작업에서 dependency 설치/대규모 변경은 하지 않았습니다. Node26의 `DEP0205 module.register()` 경고는 숨기지 않았으며 현재 회귀 테스트는 통과했습니다.

### dependency audit — 배포 전 해소할 별도 gate

2026-09-13 `npm audit --json --ignore-scripts`는 exit 1, 영향 패키지 **12개: critical 2 / high 7 / moderate 2 / low 1**을 보고했습니다. 이는 advisory 개수나 실제 공격 재현 수가 아닙니다.

- Critical 직접 의존성: `next`, `vitest`. Next에는 Proxy 우회·DoS·조건부 RCE 등이, Vitest에는 UI 서버가 열렸을 때 임의 파일 읽기/실행 advisory가 포함됩니다. 앱의 개별 접근 검사/RLS가 있으므로 Proxy 단독 보호는 아니지만 취약점이 해소됐다는 의미는 아닙니다.
- High: `brace-expansion`, `browserslist`, `js-yaml`, `nanoid`, `postcss`, `sharp`, `vite`.
- Moderate: `@vitest/mocker`, `baseline-browser-mapping`. Low: `@babel/core`.
- 대표 근거: [Next Proxy 우회](https://github.com/advisories/GHSA-26hh-7cqf-hhc6), [Next AVIF 조건 RCE](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [Vitest UI 서버](https://github.com/advisories/GHSA-5xrq-8626-4rwp).
- 감사 당시 npm은 Next 16.3.5를 수정 후보로 제시했습니다. 이를 바로 채택하지 않았습니다. 설치 local docs와 breaking change, React/ESLint/SSR 호환성 및 보수 후 전체 회귀를 별도 확인해야 합니다.
- `npm audit fix`/`--force`, lockfile 전면 재생성은 하지 않습니다. 외부 노출 전에 승인된 dependency 보수 또는 근거 있는 위험 수용이 필요합니다. dev/test 서버도 공개하지 않습니다.
- 설치 전 감사 기준이 없으므로 이 12개를 모두 기존 취약점이라고 단정하지 않습니다. 이후 audit 결과는 registry advisory 갱신에 따라 달라질 수 있습니다.

## 2. 실제 환경 없는 검증

[README](../README.md)의 `npm test`, `npm run lint`, `npm run verify:production`, `npm run typecheck`, `npm run test:e2e`를 사용합니다.

`verify:production`은 실제 `src`/`public`과 production 설정의 allowlist 복사본에서 `npm run build -- --webpack`을 실행합니다. build에서는 `*.test.*`, `*.spec.*`, 테스트용 `replay.fixtures.ts`와 E2E harness route가 빠지지만 실제 읽기 전용 demo는 production 기능이므로 포함됩니다. 원래 Next config를 바꾸거나 테스트용 소스로 대체하지 않습니다. Tailwind가 gitignored 부모 아래 복사된 `src`를 탐색하도록 runtime의 `.gitignore`만 생성합니다.

`typecheck`는 별도 복사본에서 Next production route 타입을 새로 생성한 뒤 `tsc --noEmit`을 실행합니다. `src`의 모든 테스트 및 `e2e`와 Vitest/Playwright 설정 타입을 포함하되, E2E harness는 실제 앱 route에 삽입하지 않습니다. 기존 원본 `.next`의 중복 생성 타입 문제를 지우거나 원본 전체 tsc가 통과했다고 표시하지 않습니다.

격리 산출물은 `.superpowers/sdd/quirky-dreaming-quiche/task-8-{build,typecheck}-*`에 있고 각 `verification.json`에 입력 파일 hash/명령/시각/exit가 있습니다. 기존 `.next`, `next-env.d.ts`, 실제 `.env*`, `.supabase`, 계정/원장 데이터를 복사하지 않습니다. 설치 `node_modules`만 symlink합니다. runtime의 public Supabase 설정은 가짜 loopback 주소이며 이 산출물은 **절대 배포하지 않습니다**. 실제 앱 public 설정은 build 때 고정되므로 승인된 환경에서 별도로 build해야 합니다.

중첩 lockfile로 Next `outputFileTracingRoot` 추론 경고가 발생할 수 있습니다. 실제 config/상위 lockfile을 경고 제거 목적으로 바꾸거나 지우지 않습니다. 이번 검증 build trace에는 `.env*`/`.supabase` 파일 경로가 없었습니다. 기본 Turbopack production build는 이번 검증 범위 밖입니다.

E2E의 읽기 전용 시나리오와 native harness는 synthetic 화면, React FormData/UUID/reset/잠금, 보유 상품의 새 카드 폼, 환불 시각, 한도 자료, LA 브라우저의 KST 표시를 검증합니다. 추가 폼 검증은 native 제출 payload를 캡처하며 production Action/DB에 저장하지 않습니다. 실제 Action/loader/replay 왕복의 Vitest source 저장소도 SQL emulator가 아닙니다. 로그인·RLS·실DB 저장·경합을 통과했다고 해석하지 않습니다.

### 원장 입력 시 의미 확인

- 카드 상세의 **월 한도 자료**는 실적 자료와 독립입니다. 계산된 quota pool의 정확한 월·key·instance 원본을 저장하며 공유 카드는 같은 원본을 수정합니다. 월별 한도의 `입력 완료`는 전체 월 한도에서 기록 거래를 계산하고, `자료 모름`은 확인 필요를 유지합니다. 월별 `시작 잔여량`은 **기록된 거래를 replay하기 전의 opening 값**입니다. 화면의 현재 잔여를 다시 넣으면 이미 사용한 양이 이중 차감됩니다. 0은 유효하며, 원문 소수는 반올림하지 않습니다.
- 일별 한도도 같은 월·key·instance의 **월 자료 원본 하나**에 `입력 완료`/`자료 모름`을 저장합니다(`amount=null`). 입력 완료는 각 날짜에 적용된 cap에서 그날의 기록 거래를 계산하며, 다른 날짜의 정상 cap 차이를 합치거나 충돌로 바꾸지 않습니다. 카드·서비스·날짜마다 원본을 복제하지 않습니다. **일별 시작 잔여량은 미지원**으로 새 선택/입력란이 없으며, 기존 remaining/소수 원문은 확인 필요로 표시하고 상태를 직접 선택하기 전에는 저장하지 않습니다. 실제 판본·binding/중복 원본 충돌은 저장을 차단합니다. 거래 없는 pool의 사전 입력은 제공하지 않습니다.
- 환불은 실제 한국 날짜와 시각을 입력합니다. 날짜만 입력하면 기존과 같이 00:00 KST이므로 오후 결제의 당일 환불에는 실제 후속 시각이 필요합니다. 임의 시각·다음 날로 바꾸지 않습니다. 결제보다 이른 환불·누적 원금 초과·다른 owner 참조는 기존 RPC 검사 대상입니다.
- 보유 상품도 별도 실물 카드로 새 등록할 수 있습니다. 기존 카드/원장 연결은 유지하며 별칭으로 구분합니다. 오입력 제외는 원문/보정/환불을 삭제하지 않고 그 경제적 기여만 차단합니다. 조회·표시는 브라우저 시간대와 무관하게 KST이며 명시적 날짜 필터를 유지합니다.

## 3. 승인 전 운영 체크포인트

아래 값은 **운영자가 비공개로 대조하고 별도로 승인**해야 합니다. 이 작업에서는 조회·변경하지 않았습니다.

- [ ] 대상 Supabase 프로젝트/환경, 소유자, 실제 PostgreSQL 버전, CLI 버전, 적용된 migration 목록을 확인한다.
- [ ] 익명 노출/공개 가입이 꺼져 있는지, public role 권한과 Auth 설정을 확인한다.
- [ ] 전체 DB의 암호화된 백업과 복구 절차를 확보하고, 격리 환경에서 복구 연습을 수행한다. 백업을 git/데모/스크린샷에 넣지 않는다.
- [ ] 테이블별 행 수, 원본 금액·소수/legacy snapshot, owner별 카드/거래 수와 고아 참조를 **읽기 전용**으로 대조한다. 비공개 기록에만 실제 값을 남긴다.
- [ ] write 중단/maintenance 창, 적용 순서, 부분 실패 시 복구 책임자, 성공 기준을 승인한다.
- [ ] 소스 배포와 DB 버전이 일치하도록 조정한다. 최종 DB는 구형 직접 INSERT/구형 card RPC를 거절하므로 구형 앱으로 단순 되돌리면 쓰기가 복구되지 않는다.

### 첫 auth 사용자와 membership

1. 앱은 `signInWithOtp({ options: { shouldCreateUser: false } })`를 사용합니다. 로그인 폼으로 첫 계정을 생성할 수 없습니다. **이메일/대상을 확인한 별도 승인 후** 관리자가 Supabase Auth에 첫 사용자를 생성/초대하고 확인 절차를 완료합니다.
2. 실제 Auth UUID를 확인한 뒤 별도 승인된 관리 연결에서만 `public.app_members`에 해당 `user_id`, `role='owner'`, `is_active=true`를 등록합니다. 다른 사용자가 회원 행을 스스로 INSERT/UPDATE할 수 없어야 합니다. `owner`는 이 앱의 허용 역할이며 공개 관리자 UI 권한을 뜻하지 않습니다.
3. Auth의 Site URL과 redirect allowlist에 승인된 앱 origin의 `/auth/callback`을 등록하고 이메일 전달/PKCE code 교환을 확인합니다. wildcard origin으로 편의상 넓히지 않습니다. 앱 로그인 성공 메시지는 계정 존재 여부를 숨기므로 이메일 발송 성공 자체의 증거가 아닙니다.
4. `.env.example`의 두 public 값만 개인 `.env.local`에 설정합니다. 기존 `SUPABASE_SERVICE_ROLE_KEY`, `MONIQ_OWNER_ID`, `MONIQ_DEMO_OWNER_ID` getter 파일은 호환 흔적이며 현재 production 호출자가 없습니다. 이 값을 넣어도 접근 권한이나 데이터 이전이 되지 않습니다.
5. 허용 취소는 승인된 관리 경로의 `app_members.is_active=false`입니다. 이미 발급된 JWT로 새 읽기/쓰기/RPC가 거절되는지 테스트합니다. 로그아웃과 membership 취소는 별개이며 이미 본 화면의 데이터까지 회수하는 기능은 아닙니다.

### 기존 development owner 데이터는 자동 이전하지 않음

첫 auth UUID와 기존 `owner_id`가 같다고 가정하지 않습니다. membership 등록만으로 기존 owner의 자료가 옮겨지지 않습니다. 카드를 새로 등록해 이전 원장이 보이지 않는 문제를 덮지 않습니다.

- owner별 원장/카드/혜택 application/annotation/refund/membership/month input/revision/audit 및 `(owner_id,id)` FK 연결을 비공개로 확인합니다. 여러 실제 사용자의 데이터가 섞였거나 참조가 불명확하면 중단합니다.
- 이전 대상/범위/매핑/백업/검증/복구를 별도로 승인해야 합니다. 현 모델의 원장 identity trigger는 owner 변경을 막고 audit는 append-only입니다. 트리거를 임의 비활성화하거나 audit owner를 일괄 치환하는 SQL을 실행하지 않습니다.
- 필요하면 운영 전용 누적 migration/검증된 도구를 별도 설계하고 격리 백업 복제본으로 검증합니다. 이 문서는 owner 이전 SQL을 제공하거나 실행 승인하지 않습니다.

## 4. 누적 migration 경로와 fresh schema 경로

### A. 기존 DB — 이력 확인 후 누적 적용

`supabase/migrations`의 현재 순서는 다음과 같습니다. **이미 적용된 이력을 고치거나 재실행하지 않습니다.** 아래는 순서 목록이지 자동 실행 batch가 아닙니다.

1. `20260426151500_init_transactions.sql`
2. `20260426164000_add_cards_and_user_cards.sql`
3. `20260427101500_prevent_duplicate_user_cards.sql`
4. `20260427113000_expand_transactions_for_ledger.sql`
5. `20260427124500_lock_down_rls_and_drop_card_id.sql`
6. `20260427141000_add_single_owner_scope_and_card_read_policy.sql`
7. `20260427143500_add_user_card_default_rpc.sql`
8. `20260427165000_seed_sample_cards_and_transactions.sql`
9. `20260527100000_add_card_benefit_rules_and_performance.sql`
10. `20260527103000_seed_card_benefit_rules_and_requirements.sql`
11. `20260601090000_external_mvp_owner_auth_demo.sql`
12. `20260601093000_external_mvp_card_support_and_rules.sql`
13. `20260601100000_external_mvp_demo_seed.sql`
14. `20260601103000_seed_external_mvp_merchant_and_exclusion_rules.sql`
15. `20260913090000_private_access.sql`
16. `20260913093000_card_workspace_models.sql`
17. `20260913100000_ledger_commands.sql`
18. `20260913103000_verified_card_policies.sql`
19. `20260913110000_household_income.sql`

특히 과거 seed migration에는 카드/거래 및 legacy 규칙 데이터가 있습니다. 적용됐는지 모른 채 운영 DB에 전체 파일을 붙여넣지 않습니다. 기존 DB에 미적용 seed를 실행해야 한다면 그 데이터 변경도 사전에 검토·승인해야 합니다. 기존 seed의 `full`/`partial`은 현재 실행 판본 검증을 뜻하지 않습니다.

15는 활성 membership 접근 제한, 16은 원본 보존/legacy 검토 표시/불변 판본/월별 자료, 17은 source+audit RPC와 직접 DML/구형 RPC 폐쇄입니다. 18은 **cards 메타데이터만** 추가하고 두 상품의 실행 정책·개인 원장·계정은 생성하지 않습니다. 파일명에 `verified`가 있어도 정책 발행 단계가 아닙니다. 19는 `income_entries` 원본과 같은 `apply_ledger_command`/owner revision/audit 경로의 수입 command를 추가하고 `get_ledger_inputs`에 versioned `household` snapshot을 더합니다. 수입은 카드 replay 입력이 아니며 별도 쓰기 RPC나 projection table을 만들지 않습니다.

19 적용 전 구버전 snapshot에는 `household`가 없습니다. 앱은 이를 지원되는 빈 수입 또는 0원으로 바꾸지 않고 `수입 기능 적용 필요`와 수입·차액 `확인 필요`로 표시하며, 지출 조회·입력은 유지하되 수입 생성/수정/제외만 차단합니다. migration은 기존 카드·거래·owner ID를 이전하거나 치환하지 않습니다. 적용 후에도 기존 owner별 행 수, 참조, 원문 decimal, owner revision/audit와 새 수입 행의 owner를 읽기 전용으로 대조해야 합니다. 이 저장소 작업에서는 실제 migration history, owner 보존 결과, RLS/RPC/경합을 실DB에서 검증하지 않았습니다.

### B. fresh schema — 빈 Supabase 기반 DB 전용

`supabase/schema.sql`은 `auth.users`, `auth.uid()`, `anon/authenticated/service_role` 등 **Supabase 기반 환경**을 전제로 한 구조 snapshot입니다. 맨 PostgreSQL의 빈 DB만으로 동등한 환경이 되지 않습니다. `pgcrypto`, `btree_gist`가 필요하고 pgTAP 테스트에는 `extensions` schema의 `pgtap`가 필요합니다.

- 이 파일은 반복 실행 가능한 schema upgrade 도구가 아닙니다. 뒤쪽의 `CREATE FUNCTION`, `ADD COLUMN` 등은 중복 적용 시 실패합니다. 기존 DB 위에 실행하거나 fresh schema 다음에 모든 migration을 다시 실행하지 않습니다.
- fresh schema 자체에는 공개 카드/legacy 규칙/샘플 원장 seed가 없습니다. 필요 시 승인한 공개 메타데이터 전용 마지막 migration을 **별도로** 적용할 수 있습니다. 로그인 테스트용 synthetic 상품/계정/규칙은 격리 fixture로 공급합니다.
- 누적 migration 경로에는 과거 seed 행·그 legacy snapshot이 남으므로 두 경로의 **전체 행 데이터가 같을 것을 기대하지 않습니다**. 구조·권한·함수·불변 조건 및 공통 synthetic 입력의 동작을 비교하고, seed 차이는 별도 목록으로 확인합니다.
- 정적 대조에서 private_access/workspace_models/ledger_commands/household_income 네 SQL 본문이 schema.sql에 포함됨을 확인했습니다. 이것은 **실제 설치 결과 동등성 증명도, SQL 문법/실행 검증도 아닙니다**. 초기 테이블/확장/기본권한/seed 차이를 포함한 실행 비교가 Task10에 남습니다.

## 5. Task10 — 격리 DB 검증 절차 (현재 BLOCKED)

확인 시 `supabase`, `docker`, `psql`, `postgres`, `initdb`, `pg_ctl` 실행 파일이 모두 없었습니다. 설치·daemon 시작·실제/linked DB 접속으로 우회하지 않았습니다. CLI local project `config.toml`도 없으므로 준비된 테스트 환경이라고 간주하지 않습니다.

별도 승인된 **폐기 가능한 로컬 Supabase 테스트 환경**에서만 다음을 수행합니다. 실제 계정/원장을 복제하여 공개 테스트 증거로 사용하지 않습니다.

1. Supabase CLI/PostgreSQL/확장 버전과 local config를 기록한다. 프로젝트 연결 기본값 대신 대상 host/DB/port를 명시적으로 확인한다. `supabase db reset` 같은 파괴적 초기화는 **확인된 disposable 로컬 DB에서만**, 별도 승인 아래 수행한다. linked/production을 대신 사용하지 않는다.
2. 동일 기반 버전의 별도 DB 두 개를 준비한다. A에는 모든 누적 migration, B에는 fresh schema를 적용한다. 첫 오류에서 중단하고 실패한 SQL/state를 남긴다. CLI가 실제 적용한 migration 목록과 DB 상태를 대조한다.
3. privileged read-only metadata로 public 구조를 비교한다. 예: 양쪽 `pg_dump --schema-only --schema=public --no-owner` 결과와 `pg_constraint`, `pg_policies`, 함수 `prosecdef/provolatile/proconfig`, 테이블/RPC/sequence 권한, 확장 위치/버전을 비교한다. ACL을 제거하는 `--no-acl`로 중요한 차이를 숨기지 않는다. dump 도구의 임시 토큰·비본질적 출력 순서만 분리하고 의미 있는 차이는 판정한다.
4. final-schema pgTAP 세 파일만 실행한다. 설치 CLI의 `supabase test db --help`에서 경로 인자/`--local` 지원을 확인한 다음 다음 의도를 실행한다.

   ```sh
   supabase test db supabase/tests/access.test.sql supabase/tests/card_workspace_models.test.sql supabase/tests/ledger-commands.test.sql --local
   ```

   CLI 버전에 따라 개별 경로로 나누어 실행해도 됩니다. **경로 없이 모든 파일을 자동 수집하면 안 됩니다.** `card_workspace_upgrade.test.sql`은 아래 별도 stage 전용입니다. psql 대안은 확인된 disposable DSN을 명시해 `psql -X -v ON_ERROR_STOP=1 -f <정확한-테스트파일>`로 실행하되 TAP 출력의 `not ok`/계획 불일치도 판정해야 합니다. SQL exit 0만으로 pgTAP 성공을 선언하지 않습니다.
5. `card_workspace_upgrade.test.sql`은 `20260913090000_private_access`까지만 적용한 **세 번째 격리 DB**에서 psql로 실행한다. 내부 `\ir`가 workspace_models migration을 적용하고 rollback한다. 최종 schema DB에 실행하면 중복 객체 오류가 나므로 final suite와 섞지 않는다. 기존 decimal/원문 snapshot/owner/id/참조 보존을 검사한다.
6. 경합은 기존 `supabase/tests/ledger-commands-concurrency.mjs`를 사용한다. 명시적인 loopback DSN이며 DB 이름이 **`moniq_task4_disposable`**인 경우만 허용한다. 필요한 Supabase 기반 schema를 그 DB에 준비한다. 새 코드나 실제 DB로 우회하지 않는다. concurrent create, 실제 owner lock 대기, stale edit, 누적 환불 상한, 동일 request 재전송을 검사한다. 커밋된 synthetic audit를 남기는 harness이므로 승인된 폐기 절차로 DB를 처리한다. `node --check` 성공은 이 테스트의 실행 성공이 아니다.
7. 실제 웹 앱 + 그 테스트 DB에서 아래 인수 시나리오를 수행한다. SQL 역할/JWT 설정 fixture는 이메일 링크·세션 refresh·브라우저 저장 인수를 대신하지 않는다. 네트워크 실패/저장 후 응답 유실도 통제 가능한 테스트 연결에서만 유발한다.

### 실제 DB 인수 체크리스트

- [ ] Synthetic A/B 활성 계정과 비회원·취소 회원을 생성. 허용 계정 로그인 및 다른 사용자 데이터 읽기/쓰기 거절.
- [ ] 카드 등록 → 전월 총액(미입력/명시 0/완료 구분) → 거래 입력 → 세 탭/상세 값 일치.
- [ ] 월·목표 변경, 50건 페이지와 전체 합계, KST 월 경계·동일 timestamp·1,001건.
- [ ] 과거 수정 → 단일 snapshot 전체 replay → 다음 달 구간/혜택 변화; manual total·0 보정·실제 확정은 보존.
- [ ] synthetic 검증 판본의 직접 공유 binding/겹치는 실적/공통 한도 및 월중 판본 변경. 일반 사용자에게 약관 편집을 요구하지 않음. 공유 연결은 승인된 테스트 command 경로로 준비.
- [ ] 부분취소는 원거래 연결 refund. 발생월 현금흐름과 원월 귀속을 분리하고 누적 상한/복원 정책 미검증 경로 확인.
- [ ] 동일 UUID/payload는 source·audit·revision 중복 없음; UUID 변경 payload 충돌, entry stale version, 보정 stale basis, 타 사용자 참조, 실패 batch의 원자 rollback.
- [ ] 저장 확정 후 조회 실패는 `saved_needs_review`; 응답 미확인은 최초 payload/UUID 재시도. 불명확한 상태를 rollback/새 거래로 오인하지 않음.
- [ ] 로그아웃, 같은 JWT의 membership 취소 후 읽기·쓰기·RPC 거절. 쿠키 refresh 및 캐시로 타 사용자 자료가 섞이지 않음.
- [ ] A/B의 동일 synthetic 입력 결과와 스키마/권한 차이를 기록하고 Task10 승인받음.

## 6. 백업·롤백·적용 후 검증

- 적용 전 백업의 복구 가능성을 검증하고 maintenance/write 중단 상태를 유지합니다. migration별 트랜잭션/CLI 실행 경계를 확인하여 부분 적용 상태를 기록합니다. 실패 후 같은 DDL 전체를 무작정 재실행하거나 migration history를 성공으로 표시하지 않습니다.
- 기본 복구 전략은 승인된 백업을 **별도 격리 인스턴스에 복원·검증한 뒤** 전환 여부를 승인하는 것입니다. 보정/audit/판본 이력이 생긴 뒤 DROP/owner 치환으로 과거 구조를 복원하는 자동 down script는 없습니다.
- 데이터 손실 없는 forward-fix가 가능하면 신규 누적 migration으로 별도 검토합니다. 기존 migration/발행 판본/audit는 재작성하지 않습니다. rollback을 이유로 직접 DML·anon 접근을 다시 열지 않습니다.
- 적용 후 migration 목록, 제약/정책/RPC 권한, 기존 원문 decimal과 행 수/참조, owner revision·audit 연결, 비회원/취소 회원 거절, source snapshot 및 대표 원장 합계를 읽기 전용으로 확인합니다. 검증을 위한 새 실제 거래 생성도 별도 승인이 필요합니다.
- **Task11:** 두 KB candidate는 적용 후에도 비실행입니다. 효력기간·절사·실거래 조건 정규화·해당 환불/주유/가족/유예 조건 등 출처별 검증이 끝나기 전 `published+verified`로 올리지 않습니다. 현재 입력/보정 기능의 존재가 공식 약관 정확성을 보장하지 않습니다.
- 실제 DB 적용·계정/owner 변경·배포·commit/push는 각각 별도 승인과 결과 기록이 필요합니다. 이 문서 또는 Task8 코드 검증 통과를 그 승인으로 사용하지 않습니다.
