import { describe, expect, it } from "vitest";
import { publicCardCandidates, validateCandidatePack } from "./index";
import { cardPolicySchema, type CardPolicy } from "../policy-schema";
import { replayLedger } from "../replay";
import { inputs, monthData, refund, transaction, version } from "../replay.fixtures";
import { selectRuleVersion } from "../scope-bindings";
import { matchPolicyConditions } from "../rule-matching";
import type { CandidatePurchaseModel } from "./schema";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { formatBenefitDisplay } from "@/lib/card-workspace/benefit-display";

// TEST ONLY: these dates, verified status and floor adapter are not an issuer validity claim.
// All eligible purchase rewards below divide exactly; the synthetic floor cannot affect results.
const syntheticWindow = { effective_from: "2026-01-01", effective_until: "2026-04-01", version_label: "SYNTHETIC TEST WINDOW — NOT OFFICIAL" };
function candidate(code: string) {
  return publicCardCandidates.find(pack => pack.productCode === code)!;
}
function model(code: string): CandidatePurchaseModel {
  const result = candidate(code).purchaseModel;
  expect(result, "a non-executable purchase candidate must exist").toBeDefined();
  return result!;
}
function syntheticPolicy(code: string): CardPolicy {
  const source = model(code);
  return cardPolicySchema.parse({ ...source, benefits: source.benefits.map(benefit => ({
    ...benefit, reward: { kind: "rate", numerator: benefit.reward.numerator, denominator: benefit.reward.denominator, roundingUnit: 1 },
  })) });
}
function purchase(id: string, amount: number, category: string, day = "02") {
  return { ...transaction(id, amount, `2026-02-${day}T01:00:00Z`, "a", Number(day)), actual_amount: amount, ledger_category: category };
}
function replay(code: string, spend: number, purchases: ReturnType<typeof purchase>[], options: { openingKnown?: boolean; refund?: boolean } = {}) {
  const rules = syntheticPolicy(code);
  for (const row of purchases) for (const item of model(code).benefits) {
    const match = matchPolicyConditions(item.conditions, { merchant: { status: "unknown", normalizedName: row.merchant_name, category: null, candidates: [] }, category: row.ledger_category, channel: row.payment_channel, installmentMonths: row.installment_months, amount: row.actual_amount });
    if (match.matches) expect(BigInt(row.actual_amount) * BigInt(item.reward.numerator) % BigInt(item.reward.denominator), "synthetic fixture must not rely on unverified rounding").toBe(BigInt(0));
  }
  const source = inputs({
    ruleVersions: [version("a", rules, syntheticWindow)], transactions: purchases,
    monthInputs: [monthData("2026-01", "performance", "spend", { status: "manual_total", amount: spend }), monthData("2026-02"),
      ...(options.openingKnown === false ? [] : rules.quotas.map(pool => monthData("2026-02", "quota", pool.key)))],
    adjustments: options.refund ? [refund(purchases[0].id, 1000)] : [],
  });
  return { result: replayLedger(source, "2026-02"), source };
}
const benefit = (row: ReturnType<typeof replay>["result"]["transactions"][number], key: string) => row.benefits.find(item => item.key === key)!;

describe("official conditions under an explicit synthetic window", () => {
  it.each([
    ["09184", "favorite_mart", "biz_mart_eligible", 100000, 399999, 0],
    ["09184", "favorite_mart", "biz_mart_eligible", 100000, 400000, 15000],
    ["09184", "favorite_mart", "biz_mart_eligible", 140000, 799999, 15000],
    ["09184", "favorite_mart", "biz_mart_eligible", 140000, 800000, 20000],
    ["09184", "favorite_mart", "biz_mart_eligible", 9999, 400000, 0],
    ["09184", "favorite_mart", "biz_mart_eligible", 10000, 400000, 1500],
    ["09230", "trendy_beauty", "miz_beauty_eligible", 100000, 399999, 0],
    ["09230", "trendy_beauty", "miz_beauty_eligible", 100000, 400000, 15000],
    ["09230", "trendy_beauty", "miz_beauty_eligible", 100000, 799999, 15000],
    ["09230", "trendy_beauty", "miz_beauty_eligible", 100000, 800000, 20000],
    ["09230", "daily_coffee", "miz_coffee_eligible", 19999, 400000, 0],
    ["09230", "daily_coffee", "miz_coffee_eligible", 20000, 400000, 2000],
    ["09230", "daily_department", "miz_department_eligible", 120000, 400000, 10000],
    ["09230", "daily_pharmacy", "miz_pharmacy_eligible", 250000, 800000, 12500],
  ] as const)("%s %s category=%s amount=%i/spend=%i", (code, key, category, amount, spend, expected) => {
    const { result } = replay(code, spend, [purchase("one", amount, category)]);
    expect(benefit(result.transactions[0], key).appliedAmount).toBe(expected);
  });

  it("shares each Biz Basic group while keeping Favorite and the three Basic groups independent", () => {
    const { result } = replay("09184", 400000, [
      purchase("rental", 80000, "biz_rental_eligible", "02"), purchase("security", 50000, "biz_security_eligible", "03"),
      purchase("stationery", 10000, "biz_stationery_eligible", "04"), purchase("telecom", 130000, "biz_telecom_eligible", "05"),
      purchase("online", 120000, "biz_happy_store_eligible", "06"), purchase("mart", 120000, "biz_mart_eligible", "07"),
      purchase("shopping", 100000, "biz_online_eligible", "08"),
    ]);
    expect(result.transactions.map(row => row.benefits.reduce((sum, value) => sum + (value.appliedAmount ?? 0), 0))).toEqual([8000, 2000, 0, 10000, 10000, 15000, 15000]);
    expect(result.months[1].cards[0].benefits).toEqual([expect.objectContaining({ unit: { kind: "points", program: "kb_pointree" }, amount: 60000 })]);
  });

  it("shares Trendy groups and the separate department/convenience and mart/pharmacy pools", () => {
    const { result } = replay("09230", 400000, [
      purchase("beauty", 50000, "miz_beauty_eligible", "02"), purchase("sports", 50000, "miz_sports_eligible", "03"),
      purchase("spa", 50000, "miz_spa_eligible", "04"), purchase("delivery", 50000, "miz_delivery_eligible", "05"),
      purchase("department", 80000, "miz_department_eligible", "06"), purchase("convenience", 50000, "miz_convenience_eligible", "07"),
      purchase("mart", 160000, "miz_mart_eligible", "08"), purchase("pharmacy", 100000, "miz_pharmacy_eligible", "09"),
    ]);
    expect(result.transactions.map(row => row.benefits.reduce((sum, value) => sum + (value.appliedAmount ?? 0), 0))).toEqual([10000, 5000, 10000, 5000, 8000, 2000, 8000, 2000]);
  });

  it.each([["09184", "biz_mart_eligible"], ["09230", "miz_beauty_eligible"]])("%s excludes the entire rewarded purchase but not a merely eligible exhausted purchase", (code, category) => {
    const { result } = replay(code, 400000, [purchase("rewarded", 100000, category, "02"), purchase("exhausted", 20000, category, "03"), purchase("ordinary", 400000, "ordinary", "04"), purchase("tax", 50000, "tax", "05")]);
    expect(result.transactions.map(row => row.recognized[0].appliedAmount)).toEqual([0, 20000, 400000, 0]);
    expect(result.months[1].cards[0].performance[0].amount).toBe(420000);
  });

  it("respects previously consumed fuel discount in the shared taxi/fuel benefit-amount pool", () => {
    const { source } = replay("09230", 400000, [purchase("taxi", 50000, "miz_taxi_eligible")]);
    const fuel = candidate("09230").fuel;
    expect(fuel).toBeDefined();
    expect(fuel!.unit.kind).toBe("won");
    source.monthInputs = source.monthInputs.filter(row => row.scope_key !== fuel!.sharedBenefitQuotaKey);
    // Synthetic known 7,000 won fuel discount, NOT 7,000 won fuel spend or a guessed fuel calculation.
    source.monthInputs = [...source.monthInputs, monthData("2026-02", "quota", fuel.sharedBenefitQuotaKey!, { status: "remaining", amount: 3000 })];
    const result = replayLedger(source, "2026-02");
    expect(benefit(result.transactions[0], "daily_taxi").appliedAmount).toBe(3000);
    expect(result.months[1].quotas.find(pool => pool.scopeKey === fuel!.sharedBenefitQuotaKey)).toMatchObject({ consumption: "benefit_amount", remaining: 0 });
  });

  it.each(["09184", "09230"])("%s does not turn missing previous-month data into zero or a supported no-requirement card", code => {
    const { source } = replay(code, 400000, [purchase("one", 100000, code === "09184" ? "biz_mart_eligible" : "miz_beauty_eligible")]);
    source.monthInputs = source.monthInputs.filter(row => row.month !== "2026-01-01");
    const result = replayLedger(source, "2026-02");
    expect(benefit(result.transactions[0], code === "09184" ? "favorite_mart" : "trendy_beauty").appliedAmount).toBeNull();
  });

  it.each(["cash_advance", "card_loan", "tax", "public_charge", "apartment_fee", "government_subsidy", "tuition", "fees", "interest", "late_fee", "annual_fee", "gift_card", "prepaid", "unapproved_slip"])("keeps %s out of the next performance total for both products", category => {
    for (const code of ["09184", "09230"]) {
      expect(replay(code, 400000, [purchase("excluded", 10000, category)]).result.transactions[0].recognized[0].appliedAmount).toBe(0);
    }
  });

  it("can represent a verified performance-excluded bill without excluding its Basic reward", () => {
    // Synthetic classification explicitly establishes BOTH utility-service eligibility
    // and public-charge performance exclusion; neither is inferred from the other.
    const { result } = replay("09184", 400000, [purchase("bill", 50000, "biz_utilities_eligible_performance_excluded")]);
    expect(benefit(result.transactions[0], "basic_utilities").appliedAmount).toBe(5000);
    expect(result.transactions[0].recognized[0].appliedAmount).toBe(0);
  });

  it("does not exclude all Daily discount purchases from performance", () => {
    const { result } = replay("09230", 400000, [purchase("coffee", 20000, "miz_coffee_eligible")]);
    expect(result.transactions[0].recognized[0].appliedAmount).toBe(20000);
  });

  it.each(["09184", "09230"])("%s keeps unknown opening usage and unknown refund policy uncertain", code => {
    const category = code === "09184" ? "biz_mart_eligible" : "miz_beauty_eligible";
    const key = code === "09184" ? "favorite_mart" : "trendy_beauty";
    expect(benefit(replay(code, 400000, [purchase("one", 100000, category)], { openingKnown: false }).result.transactions[0], key).appliedAmount).toBeNull();
    expect(benefit(replay(code, 400000, [purchase("one", 100000, category)], { refund: true }).result.transactions[0], key).appliedAmount).toBeNull();
  });

  it("never selects an undated candidate for real use, and does not convert points into won", () => {
    const { source, result } = replay("09184", 400000, [purchase("one", 100000, "biz_mart_eligible")]);
    const inactive = version("a", syntheticPolicy("09184"), { effective_from: null, publication_status: "draft", verification_status: "unverified", published_at: null });
    expect(selectRuleVersion("product-a", "2026-02-02", [inactive])).toBeNull();
    expect(replayLedger({ ...source, ruleVersions: [inactive] }, "2026-02").months[1].cards[0].requirementStatus).toBe("unverified");
    const workspace = buildCardWorkspace(source, "1", "2026-02", result);
    expect(workspace.totals.benefitAmount).toBe(0);
    expect(formatBenefitDisplay(workspace.transactions[0].workspace!.benefitDisplay)).toContain("15,000포인트 (kb_pointree)");
  });

  it("reuses the strict policy cross-reference and unit validator without guessing a rounding rule", () => {
    const pack = candidate("09184");
    const source = model("09184");
    expect(cardPolicySchema.safeParse(source).success).toBe(false);
    const dangling = { ...source, benefits: [{ ...source.benefits[0], quotaKeys: ["not_a_pool"] }] };
    expect(validateCandidatePack({ ...pack, purchaseModel: dangling }).success).toBe(false);
    const wrongUnit = { ...source, benefits: source.benefits.map(row => ({ ...row, unit: { kind: "won" } })) };
    expect(validateCandidatePack({ ...pack, purchaseModel: wrongUnit }).success).toBe(false);
  });
});
