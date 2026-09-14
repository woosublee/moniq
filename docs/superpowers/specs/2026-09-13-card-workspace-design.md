# Moniq 카드 실적·혜택 작업공간

2026-09-13 승인된 제품 설계와 Task1–7의 최종 인터페이스를 반영한 현재 구현 계약입니다. 2026-05-27 외부 공개 MVP 문서는 이전 참고 자료이며 이 설계의 접근 범위·계산 의미를 덮어쓰지 않습니다. 이 문서는 실제 DB 적용·약관 발행·계정 변경·배포 승인이 아닙니다.

## 제품 목적과 범위

마이데이터 대신 사람이 사용처·카드·금액을 입력하고 카드별 월 실적, 혜택 사용량, 남은 한도와 부족액을 확인합니다. 본인 실사용을 우선하고 이후 지정한 사용자만 허용합니다. 더쎈카드 내 카드 경험과 제공된 실적 관리 캡처의 구조를 기준으로 하며 일반 취향의 새 대시보드로 바꾸지 않습니다.

- 규칙은 시스템/관리자 데이터입니다. 일반 사용자는 카드 추가와 원장 입력·보정·자료 확인만 합니다. 초기 관리자 웹 UI는 없습니다.
- 금융 자동 연동, 불특정 공개 가입, 광고/제휴/팁, 금융상품 추천은 제외합니다.
- 개인 원본, 환불, 사용자 보정, 계산 결과를 분리합니다. 별도 계산 서버/작업 큐/저장된 projection 없이 소규모 전체 snapshot replay를 사용합니다.
- 전체 카드번호/CVC를 저장하지 않습니다. 카드 인스턴스의 선택적 끝 4자리와 상품 식별은 별개입니다. 같은 상품을 여러 실물 카드로 등록할 수 있습니다.

## 화면과 동선

중심 URL은 `/cards?month=YYYY-MM&tab=performance|benefits|transactions`입니다. 기본 월은 한국 시간 현재 월, 기본 탭은 실적 관리입니다. `activity`는 입력 호환 별칭이며 `transactions`로 정규화합니다. 검색어/선택 카드/페이지(`query/card/page`)와 월·탭은 검색·이전/다음 달·상세·뒤로 가기에서 유지합니다.

| 화면 | 현재 표시/조작 |
|---|---|
| 실적 관리 | 흰 평면 세로 카드 목록, 동폭 3탭, 카드 이름/별칭/끝4자리, 구간 달성/최고 구간/무실적/미검증, 다구간 바·단계점·목표 깃발, 파란 인정액과 별도 사용금액, 다음 구간/개인 목표 부족액, 직접 공유 표시 |
| 혜택 관리 | 판본·서비스별 할인/적립, 원화/포인트/마일 프로그램 분리, 자동/고정/확정 출처, 한도 금액·횟수·잔여치, 그룹별 공유 pool, 미입력/미검증 사유 |
| 사용내역 | 승인/환불/현금흐름, 날짜별 거래, 상세·수정·부분취소·오입력 제외. 전체 월 계산 후 50건씩 표시; 페이지 이동이 합계를 바꾸지 않음 |
| 카드 상세 | 실제 선택 판본 및 정확한 scope instance의 전월/당월 자료, 목표, 구간·조건·출처·한도·사유. 월중 이전 판본/종료 서비스도 보존 |
| 빠른 입력 | 기본 사용처·카드/현금/포인트·금액·날짜. 채널/할부·시간·분류·고정비·메모는 보조 입력. 모르는 조건으로 원장을 저장할 수 있지만 계산을 확인 필요로 둠 |

`/`는 인증 후 내 카드로 이동하고 `/dashboard`는 기존 가계부 내용을 보존합니다. `/cards/search` 카드 찾기/등록, `/transactions/new` 입력과 KST 월 query/anchor 흐름도 유지합니다. 모바일 하단 탐색, 키보드 tooltip/Escape/focus 복원, 좁은 viewport 줄바꿈을 유지합니다. 새 UI/계산 시각화는 기존 frontend-design/dataviz 지침을 따릅니다.

## 개인 접근과 데모 경계

- SSR `@supabase/ssr` 사용자 client와 `getUser()` 검증 후, `app_members`의 같은 `user_id`, `role='owner'`, `is_active=true`를 검사합니다. owner는 JWT 사용자에서 결정하며 환경변수/폼의 owner 값을 신뢰하지 않습니다.
- `src/proxy.ts`는 세션 refresh와 응답 캐시 보호를 담당하지만 단독 인가 수단이 아닙니다. loader/Action과 DB RPC/RLS에서도 권한을 확인합니다. `cookies()`/`searchParams`는 async API입니다.
- 로그인 링크는 `shouldCreateUser:false`이고 서버 측 계정 존재 여부를 노출하지 않는 응답을 사용합니다. 첫 계정·membership·기존 owner 이전은 운영자 별도 승인 사항입니다.
- 데모 cookie는 **읽기 전용 synthetic 자료 선택**일 뿐 실제 owner 세션이나 쓰기 권한이 아닙니다. `/demo`는 메모리의 가상 8카드/71거래·2026년 2월 예시를 사용하고 DB·실상품·개인 거래를 조회하지 않습니다.
- native form harness는 preview 복사본에만 route로 추가됩니다. 실제 앱 인증/저장 경로를 우회하는 production flag는 없습니다.

## 단일 snapshot과 순수 replay

실제 조회 경로는 다음과 같습니다.

1. `getCardWorkspace(month)`가 현재 허용 owner를 확인하고 owner/month별 **React 요청 내부** memoization으로 조회합니다. 영속 Next 데이터 cache가 아닙니다.
2. 사용자 SSR client가 `get_ledger_inputs(through_month)` RPC를 호출합니다. **SQL STABLE 단일 문장**이 하나의 MVCC snapshot에서 owner revision과 전체 입력을 JSON envelope로 집계하도록 구현되어 있습니다. 50/1,000개 REST 페이지로 계산 입력을 자르지 않습니다.
3. envelope는 `{ ownerId, ownerRevision, throughMonth, inputs }`입니다. `inputs`는 카드/판본/직접 membership/원거래/연결 환불/보정/월 자료/가맹점 규칙과 `startMonth`를 포함합니다. 이전 월 원거래를 계산할 때 나중에 발생한 연결 환불도 포함합니다.
4. `loadCardWorkspace`는 스키마·owner·월 범위를 검사한 뒤 `replayLedger(inputs, throughMonth)`를 실행합니다. 이 함수는 IO/현재시각 없이 readonly 입력을 사용합니다. 결과에서 view model/같은 집계·상세를 만듭니다.
5. 과거 수정 후에도 같은 전체 snapshot replay를 사용합니다. 원본의 legacy calculated 값이나 audit `basis_*`는 현재 계산의 원천으로 승격하지 않습니다.

`loadCardWorkspace(ownerId,month)`는 저장 후 새 snapshot 조회를 위해 uncached입니다. 실제 SQL snapshot 동시성/격리 성질은 Task10 실행 검증이 남아 있습니다.

## 원본 저장과 요청 생명주기

`applyLedgerCommand(requestId,input,month)` → strict command parse → 사용자 인가 → `apply_ledger_command(request_id,command)`의 유한 명령만 사용합니다. RPC에는 owner 인자가 없습니다.

- 명령: transaction create/update/exclude, refund create/update/void, annotation create/update/void, card create/update/default/archive, month_input create/update, membership create/update/remove, batch.
- 생성 ID는 client UUID이며 충돌 시 upsert하지 않습니다. batch는 1–100개, 중첩/동일 실제 row 중복 변경을 거절합니다.
- SQL은 활성 membership 확인/잠금과 owner revision lock 아래 canonical hash·request UUID, entry `expected_version`, annotation `basis_input_revision`, owner 참조·환불 상한·binding 조건을 검사하도록 구현되어 있습니다.
- 원본 변화 + owner revision 증가 + append-only `ledger_mutation_log` before/after/result IDs가 한 트랜잭션입니다. 같은 UUID+payload 재전송은 같은 receipt, 다른 payload는 충돌입니다. 직접 DML과 구형 default/delete RPC는 일반 API 역할에서 폐쇄했습니다.
- 결과는 `saved`, `saved_needs_review`(저장 확정·후속 조회 실패), `rejected`(확정 거절), `outcome_unknown`(저장 여부 미확인)입니다. 저장 후 snapshot revision은 receipt 이상이어야 합니다.
- `useLedgerActionState`는 `[state, dispatch, pending, onSubmit, blocked]`를 반환합니다. 모든 실제 form은 `onSubmit`과 `LedgerRequestFields`를 같이 연결합니다. UUID/month/version은 mounted 시도에 고정됩니다.
- 거절 입력은 보존하며, 미확인 응답은 입력 잠금 후 **동일 최초 FormData/UUID**로 재시도합니다. 확인된 create 성공 다음에만 native reset과 새 request/entry UUID를 발급합니다. quick form reset 기본 카드는 mount 당시 기준으로 DOM/React state/hidden paymentMethod가 일치합니다.
- 같은 거래 editor 안의 형제 폼과 닫기만 `LedgerMutationBoundary`로 잠급니다. 전역 잠금이 아니며 확인된 edit 후에는 최신 자료로 다시 열어야 합니다. 페이지 이탈/unmount 후 미확인 요청 영속 복원은 미구현입니다.

## 계산 의미와 확실성

### 금액·시각

신규 KRW는 안전한 정수 범위만 허용하며 원문 정수와 BigInt 범위를 확인한 뒤 Number로 변환합니다. legacy 소수 금액은 text로 보존하고 미수정 필드는 update patch에서 제외합니다. 신규 날짜-only는 KST 00:00, 미수정 날짜는 원래 시각(초/밀리초)을 유지합니다. 월/일은 `Asia/Seoul`의 반개구간이고 동일 timestamp도 DB stable sequence로 결정적인 순서를 갖습니다.

승인 사용액/환불액/실적 인정액/자동 예상/고정 예상/실제 확정을 구분합니다. 보존된 `actual_amount`는 승인 원금/환불 상한 기준입니다. 원화·포인트·마일은 unit/program별 합계이며 최대 혜택 비교도 다른 단위를 섞지 않습니다. 알 수 없는 금액은 `null + reasons`, 알려진 0은 0입니다.

### 월 자료·실적·목표

- `manual_total`은 **정확한 월/scope instance의 대체 총액**이며 원장 합계에 더하지 않습니다. 0도 입력입니다. 합계 차이는 원문과 원장값을 함께 표시하고 사용자의 값을 자동 교정하지 않습니다.
- 실적 자료는 `manual_total/complete/incomplete/before_tracking_unknown`. 한도 자료는 독립적으로 `complete/unknown/remaining`입니다. `remaining`은 추적 거래 **이전 월초 잔여치**입니다. 전월 총액만 입력해 과거 한도 소비까지 아는 것으로 간주하지 않습니다.
- 명시 무실적, 미검증, 미입력, 알려진 0, 미달/달성/최고 구간을 구분합니다. 검증된 gross/net_paid/exclusion 정책별로 인정하며 모든 카드에 `final_amount`를 공통 기준으로 쓰지 않습니다.
- 전월 실적으로 당월 혜택, 당월 인정액으로 다음 달 준비를 표시합니다. 개인 목표와 실제 달성·다음 구간은 별개입니다.
- 실적 공유는 대상 카드별 직접 기여 집합이며 비대칭·비전이입니다. 같은 거래는 같은 scope에 한 번만 기여합니다. 실적 공유와 한도 공유는 독립입니다.

### 판본·혜택·한도

날짜에 유효한 `published+verified` 판본만 선택하고 겹치면 높은 `version_order`가 우선합니다. 발행 판본은 불변이며 보정판은 새 순서로 추가합니다. scopeKey뿐 아니라 날짜/판본/scopeInstanceKey의 정확한 binding을 사용합니다.

현재 strict v1은 정액/정률/분수 rate와 정수 절사 단위, 최소 금액, 채널/할부/조건·제외, 건별 상한, 일·월 금액/횟수/적격 지출 한도, 독립/공통 pool을 표현합니다. `0`은 소진/한도 없음, `null`은 명시 무제한입니다. 중첩은 약관이 명시한 exclusive priority/maximum 또는 순서 있는 상호 stack만 허용하며 근거 없는 중첩은 unknown입니다.

안정 pool은 scope instance+quota key+기간으로 식별합니다. 월중 판본이 바뀌어도 정의/단위/직접 기여 집합/cap이 일치하면 소비를 유지하고, 충돌·coverage hole을 새 한도로 reset하거나 임의 union하지 않습니다. 일별 opening 잔여치 등 표현되지 않은 조건은 확인 필요입니다.

당월 실적은 before_transaction과 혜택 독립적인 including_transaction/month_end만 지원합니다. 직접 순환과 미지원 비순환 의존 그래프는 사유를 달리 기록하고 임의 반복 계산하지 않습니다.

### 환불·보정

- 실제 취소는 양수 refund를 원거래에 연결합니다. 입력 오류 제외와 다르며 카드 제거는 archive입니다. 원거래/환불/보정 이력을 hard delete하지 않습니다.
- 환불 자동 처리는 검증된 `verified_original_month_net_replay`에서만 원월 순액·한도 재배분을 실행합니다. `unknown` 및 `verified_unsupported`는 실행하지 않습니다. 발생월 현금흐름과 원거래 귀속 계산을 섞지 않습니다.
- 자동 예상·예상 고정(`benefit_eligible`)·실제 확정(`confirmed_benefit`)·실적 보정은 별도로 보존합니다. 적용 우선순위는 명시 실제 확정 → 예상 고정 → 자동이며 0에도 적용합니다. 자동 복귀를 명시한 경우에만 해당 보정을 void합니다.
- 재계산은 보정 `amount`를 덮어쓰지 않습니다. 원래 자동값/입력 revision/판본은 감사 근거입니다. `needs_review`, 사라진 target, 미배분 보정은 원문·금액·종류·target을 보존하고 명시 재확인을 요구합니다. 단순 메모 수정으로 자동 승격/재매핑하지 않습니다.

## 실제 상품 candidate와 미지원 조건

두 정확 상품만 source/coverage lookup으로 구분합니다. 상품명 lookup은 사용자의 실물 판본을 식별하는 실행 정책 선택 함수가 아닙니다.

| 상품 | 출처/단위 | 현재 상태 |
|---|---|---|
| KB국민 탄탄대로 Biz 티타늄 09184 | 공식 설명서 확보, `points/kb_pointree` | 일부 조건 후보, 기간·절사·운영 조건 미검증, 비실행 |
| KB국민 탄탄대로 Miz&Mr 티타늄 09230 | 공식 설명서 확보, 원화 청구할인 | 일부 조건 후보, 기간·절사·운영 조건 미검증, 비실행 |

`candidatePackSchema`는 `disposition:candidate`, `effectivePeriod:unverified`, 실행 불가능한 `rate_unverified_rounding`, `cancellation:unknown`을 요구합니다. 정책 parser를 완화하지 않으며 candidate→실행판본 변환 API도 없습니다. 테스트 파일 안의 synthetic verified 정책/정수율·기간은 공식 운영 규칙이 아닙니다. 메타데이터 migration은 실행 판본을 발행하지 않습니다.

효력기간·절사, 실제 KB 승인 업종/MCC·PG·임대/입점·상품권·자동납부 경로, 해외 환산/매입일, 할부 상세, 신규 유예, 가족 공유, 환불/복원, Biz 매입 순서, 대중교통 명세서일, 고시 유가/리터 환산, 비금전 티타늄/여행 서비스는 미지원 또는 미검증입니다. 가맹점 부분문자열을 확정 매칭으로 간주하지 않습니다. 자세한 근거와 synthetic 전제는 [card-rule-coverage.md](../../card-rule-coverage.md)를 따릅니다.

## 인수와 남은 gate

구현/테스트/개별 약관 검증/실제 DB 적용/배포 상태를 각각 기록합니다.

- Vitest: 순수 replay 경계, 금액/월/공유/판본/1,001건/보정 및 Action→테스트 source 저장소→loader/replay 왕복. SQL/RLS/실제 약관 검증은 아님.
- Chrome: 320/390/768/1440px 읽기 전용 3탭·URL·detail와 native UUID/재시도/reset/형제 잠금. 실제 로그인·SQL 저장 또는 실기기 notch/Safari 검증은 아님.
- 비파괴 production build/typegen: 실제 production 소스 allowlist 복사본. 원본 생성물의 full tsc 또는 기본 Turbopack build와 구분.
- **Task10 미완료:** 격리 Supabase에서 누적 migration/fresh schema 설치 결과 비교, pgTAP/RLS/RPC/경합, synthetic 실제 로그인/저장 인수. 정적 SQL 대조로 대체하지 않음.
- **Task11 미완료:** 두 실제 카드 효력기간/절사/운영 입력 검증 및 별도 정책 발행 승인.
- dependency audit 보수, 실제 DB 적용·첫 계정·허용 등록·owner 이전·배포는 [개인 사용 설정](../../private-use-setup.md)의 별도 gate를 통과해야 합니다. 현재 code gate는 이 승인이나 실행 완료를 의미하지 않습니다.
