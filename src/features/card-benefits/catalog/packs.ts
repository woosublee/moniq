import { publicProductIdentities, type CandidatePack } from "./schema";
import { bizPurchaseModel, mizPurchaseModel, candidateInputContract } from "./purchase-models";

const effectivePeriod: CandidatePack["effectivePeriod"] = {
  status: "unverified",
  reason: "설명서의 출시일·문서 ID·파일명·심의일은 판본 효력일이 아닙니다. 효력 시작·종료일을 확인하기 전에는 실사용 계산에 적용하지 않습니다.",
};
const unsupportedConditions = [
  "본 혜택 판본의 효력 시작·종료일 미검증: 모든 실사용 자동 계산 비활성",
  "원·포인트 소수 결과의 절사/반올림 미검증",
  "KB 승인 업종·PG·임대/입점매장·상품권·자동납부·전용 경로의 실제 입력 검증 미구현",
  "본인회원 한도 문구만으로 가족카드 실적 합산·한도 공유를 추정하지 않음",
  "부분/익월 취소의 실적 귀속·혜택 회수·한도 복원·후속 거래 재배분 미검증",
  "신규 실적 유예 자동 판정, 해외 환산/매입일, 청구주기 및 할부 분할 귀속 미지원",
  "주유 고시가/리터 환산과 티타늄 브랜드 부가서비스 미지원",
];

export const bizTitaniumCandidate: CandidatePack = {
  ...publicProductIdentities["09184"], disposition: "candidate",
  purchaseModel: bizPurchaseModel, inputContract: candidateInputContract,
  fuel: { status: "not_implemented", page: 2, unit: { kind: "points", program: "kb_pointree" }, ratePerLitreByTier: { base: 110, plus: 120 }, referencePrice: "issuer_posted_gasoline", rounding: "unverified", eligibleSpendCapByTier: { base: 200000, plus: 300000 }, sharedBenefitQuotaKey: null },
  effectivePeriod,
  coverage: {
    status: "partial",
    verifiedConditions: [
      "p.2: 전월 40만/80만원, Favorite 건당 1만원 이상. 마트·온라인몰 각각 15%, 월 15,000/20,000 포인트리.",
      "p.2: SK·GS 주유 110/120P/L, 적립대상 주유 이용액 월 20만/30만원. 고시 휘발유가 환산 필요.",
      "p.2: 마트는 이마트·홈플러스·롯데마트·하나로식자재. 온라인몰·임대매장·상품권·SSM 제외. 인터넷쇼핑은 G마켓·옥션·11번가·인터파크·롯데ON몰·신세계몰, 이용권·여행·항공권·티켓·도서·상품권/선불 제외.",
      "p.3: Basic 40만원 이상, 운영지원·납부지원·온라인몰 각 10%, 각 묶음 통합 월 10,000 포인트리.",
      "p.3: 운영지원은 코웨이·청호나이스·SK매직 정수기 자동납부, 보안/용역, 문구/사무용기기. 보안/용역·문구/사무용기기는 KB 업종 기준이며 PG 결제 제외.",
      "p.3: 납부지원은 4대 사회보험·전화/케이블TV/인터넷요금·전기/수도. 온라인은 SK행복스토어 및 KB 앱 해당 카드 주요혜택의 플러스O2O 경로 이용금액.",
      "p.4: Favorite 서비스 받은 매출 전체 및 명시 제외항목은 전월 실적에서 제외. 국내 승인 월 기준, 매입 순서 한도 적용, 잔액 이월 없음.",
      "p.4: 적립 제외는 무이자할부 및 상품권/선불 구입·충전. 실적 제외와 적립 제외 목록을 혼동하지 않음.",
    ],
    unsupportedConditions: [...unsupportedConditions, "전표 매입 순서 입력 미지원: synthetic 테스트는 승인·매입 순서가 같은 경우에 한정", "마이비즈 무료 사업지원서비스는 금전 혜택 계산 대상이 아님"],
  },
};

export const mizMrTitaniumCandidate: CandidatePack = {
  ...publicProductIdentities["09230"], disposition: "candidate",
  purchaseModel: mizPurchaseModel, inputContract: candidateInputContract,
  fuel: { status: "not_implemented", page: 1, unit: { kind: "won" }, ratePerLitreByTier: { base: 100, plus: 100 }, referencePrice: "issuer_posted_gasoline", rounding: "unverified", eligibleSpendCapByTier: null, sharedBenefitQuotaKey: "daily_transport_fuel" },
  effectivePeriod,
  coverage: {
    status: "partial",
    verifiedConditions: [
      "p.1: 전월 40만/80만원. Trendy 1(미용·스포츠·결혼/가전), Trendy 2(SPA·식품배송·인테리어) 각각 20%, 각 통합 월 15,000/20,000원.",
      "p.1: Trendy 1은 미용원·피부미용원·화장품점, 종합스포츠센터·스포츠용품·골프장/연습장, 결혼식장/서비스·가전. Trendy 2는 ZARA·H&M·유니클로, 배달의민족·더반찬·마켓컬리, IKEA·MUJI·까사미아. SPA/인테리어 온라인몰·상품권·임대매장 제외.",
      "p.1: 커피·베이커리·아이스크림 건당 2만원 이상 10%, 월 10,000/15,000원. 상품권·선불충전 제외, 백화점/마트 입점 일부 매장은 제외될 수 있음.",
      "p.1 표 병합 셀: 대중교통·택시 10%와 SK·GS 주유 100원/L는 통합 월 10,000/15,000원. 주유 독립 한도가 아님.",
      "p.1: 신세계·롯데·현대백화점 및 GS25·CU 10%, 이마트·롯데마트·홈플러스 및 약국 5%, 각각 통합 월 10,000/15,000원. 백화점 온라인몰/상품권, 마트 온라인몰/상품권/입점매장/SSM 제외.",
      "p.2: Trendy 서비스 받은 매출 전체 및 명시 제외항목 실적 제외. Daily는 일괄 제외가 아니며 별도 실적 제외에 해당하면 제외.",
      "p.2: 할인 제외는 무이자할부 및 상품권/선불 구입·충전. 이용 순서 월 한도, 잔액 이월 없음.",
    ],
    unsupportedConditions: [...unsupportedConditions, "버스·지하철 명세서 이용일 입력 미지원; 교통·주유 pool은 미구현 주유 소비가 없다고 확인한 synthetic 테스트에 한정", "여행 우대서비스 금액 계산 미지원"],
  },
};
