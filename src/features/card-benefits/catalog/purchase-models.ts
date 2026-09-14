import type { CardPolicy } from "../policy-schema";
import type { CandidatePurchaseModel } from "./schema";

type Unit = NonNullable<CardPolicy["benefits"][number]["unit"]>;
const points: Unit = { kind: "points", program: "kb_pointree" };
const won: Unit = { kind: "won" };
const performance: CardPolicy["benefits"][number]["performance"] = { kind: "previous_month", scopeKey: "spend" };
const tiers = [{ key: "base", minimumSpend: 400000 }, { key: "plus", minimumSpend: 800000 }];

// Codes here are normalized, already-verified facts for a candidate model, NOT
// aliases for user's free-text ledger categories or an issuer MCC dictionary.
// No production normalizer manufactures these facts from a merchant name.
export const candidateInputContract = "비실행 조건 모델입니다. *_eligible 분류는 KB 승인 업종/지정 가맹점, 해당 페이지의 경로·품목·PG·임대/입점·상품권 제외, 무이자 여부를 모두 대조한 사실을 뜻합니다. 기본 *_eligible 분류는 혜택 여부와 별개인 실적 제외 항목에도 비해당함을 확인한 경우만 뜻합니다. *_performance_excluded는 실적 제외에 해당함을 따로 확인한 사실입니다. 전기·수도는 이 결합 사실만 모델링하며, 사회보험/공과금 등의 실제 실적 분류를 상품명만으로 추정하지 않습니다. 실제 입력을 이 분류로 변환하는 기능은 아직 없습니다. synthetic fixture에서만 확인된 분류를 주입합니다. 원화 일시불, 유예 종료, 단일 카드, 미지원 주유/해외/환불 없음, 승인·매입 순서 일치 및 월 초부터 한도 소비량 확인을 전제합니다. 실제 사용 지원이 아닙니다.";

// Biz p.4 / Miz p.2: performance exclusions, NOT a benefits exclusion list.
const scope = (excludedBenefits: string[]): CardPolicy["performanceScopes"][number] => ({
  key: "spend", contributorSlots: ["self"], basis: "gross", tiers,
  benefitExclusions: excludedBenefits,
  exclusions: [{ kind: "category", values: ["cash_advance", "card_loan", "tax", "public_charge", "apartment_fee", "government_subsidy", "tuition", "fees", "interest", "late_fee", "annual_fee", "gift_card", "prepaid", "unapproved_slip", "biz_utilities_eligible_performance_excluded"] }],
});
function pool(key: string, unit: Unit, base: number, plus = base): CardPolicy["quotas"][number] {
  return { key, period: "monthly", consumption: { kind: "benefit_amount", unit }, sharing: { kind: "independent" }, limit: { kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "base", amount: base }, { tierKey: "plus", amount: plus }] } };
}
function benefit(key: string, category: string, rate: number, quota: string, unit: Unit, minimum = 0): CandidatePurchaseModel["benefits"][number] {
  return {
    key, benefitKind: unit.kind === "points" ? "points" : "statement_credit", unit,
    reward: { kind: "rate_unverified_rounding", numerator: rate / 100, denominator: 100, rounding: "unverified" }, performance,
    conditions: [{ kind: "category", values: [category] }, { kind: "installment", maxMonths: 1 }, ...(minimum ? [{ kind: "minimum_amount" as const, amount: minimum }] : [])],
    recognitionBasis: "gross", quotaKeys: [quota], transactionLimit: null,
  };
}

export const bizPurchaseModel: CandidatePurchaseModel = {
  schemaVersion: 1, cancellation: { kind: "unknown" },
  // Fuel also belongs to Favorite, but is not executable in this partial model.
  // Input contract excludes all fuel; never claim this is a complete performance model.
  performanceScopes: [scope(["favorite_mart", "favorite_online"])],
  quotas: [pool("favorite_mart", points, 15000, 20000), pool("favorite_online", points, 15000, 20000), pool("basic_operations", points, 10000), pool("basic_payments", points, 10000), pool("basic_online", points, 10000)],
  benefits: [
    // p.2: three marts + Hanaro food store; listed six internet malls.
    benefit("favorite_mart", "biz_mart_eligible", 1500, "favorite_mart", points, 10000),
    benefit("favorite_online", "biz_online_eligible", 1500, "favorite_online", points, 10000),
    // p.3: each three/three/two service rows consumes its group's ONE pool.
    benefit("basic_rental", "biz_rental_eligible", 1000, "basic_operations", points),
    benefit("basic_security", "biz_security_eligible", 1000, "basic_operations", points),
    benefit("basic_stationery", "biz_stationery_eligible", 1000, "basic_operations", points),
    benefit("basic_insurance", "biz_insurance_eligible", 1000, "basic_payments", points),
    benefit("basic_telecom", "biz_telecom_eligible", 1000, "basic_payments", points),
    // This fact explicitly verifies the utility reward AND its public-charge exclusion.
    benefit("basic_utilities", "biz_utilities_eligible_performance_excluded", 1000, "basic_payments", points),
    benefit("basic_happy_store", "biz_happy_store_eligible", 1000, "basic_online", points),
    benefit("basic_o2o", "biz_o2o_eligible", 1000, "basic_online", points),
  ],
};

export const mizPurchaseModel: CandidatePurchaseModel = {
  schemaVersion: 1, cancellation: { kind: "unknown" },
  performanceScopes: [scope(["trendy_beauty", "trendy_sports", "trendy_wedding", "trendy_spa", "trendy_delivery", "trendy_interior"])],
  quotas: [pool("trendy_one", won, 15000, 20000), pool("trendy_two", won, 15000, 20000), pool("daily_coffee", won, 10000, 15000),
    // p.1 visually merged cells: transit/taxi AND fuel share this pool, not two caps.
    // Fuel amount cannot be calculated without verified posted gasoline price data.
    pool("daily_transport_fuel", won, 10000, 15000), pool("daily_department_convenience", won, 10000, 15000), pool("daily_mart_pharmacy", won, 10000, 15000)],
  benefits: [
    benefit("trendy_beauty", "miz_beauty_eligible", 2000, "trendy_one", won),
    benefit("trendy_sports", "miz_sports_eligible", 2000, "trendy_one", won),
    benefit("trendy_wedding", "miz_wedding_eligible", 2000, "trendy_one", won),
    benefit("trendy_spa", "miz_spa_eligible", 2000, "trendy_two", won),
    benefit("trendy_delivery", "miz_delivery_eligible", 2000, "trendy_two", won),
    benefit("trendy_interior", "miz_interior_eligible", 2000, "trendy_two", won),
    benefit("daily_coffee", "miz_coffee_eligible", 1000, "daily_coffee", won, 20000),
    // Taxi only in the prototype; bus/subway statement-date attribution is not implemented.
    benefit("daily_taxi", "miz_taxi_eligible", 1000, "daily_transport_fuel", won),
    benefit("daily_department", "miz_department_eligible", 1000, "daily_department_convenience", won),
    benefit("daily_convenience", "miz_convenience_eligible", 1000, "daily_department_convenience", won),
    benefit("daily_mart", "miz_mart_eligible", 500, "daily_mart_pharmacy", won),
    benefit("daily_pharmacy", "miz_pharmacy_eligible", 500, "daily_mart_pharmacy", won),
  ],
};
