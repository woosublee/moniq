import { describe, expect, it } from "vitest";
import { cardPolicySchema, wonAmountSchema } from "./policy-schema";

// Synthetic policy: A counts A+B, B counts B. Quotas deliberately differ from performance.
export const examplePolicy = {
  schemaVersion: 1,
  performanceScopes: [{ key: "spend", contributorSlots: ["self", "companion"], basis: "gross", exclusions: [{ kind: "category", values: ["tax"] }], tiers: [{ key: "base", minimumSpend: 300000 }, { key: "plus", minimumSpend: 600000 }] }],
  quotas: [
    { key: "cafe", sharing: { kind: "independent" }, limit: { kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "base", amount: 10000 }, { tierKey: "plus", amount: 20000 }] } },
    { key: "family", sharing: { kind: "shared", contributorSlots: ["self", "partner"] }, limit: { kind: "fixed", amount: 30000 } },
  ],
  benefits: [{ key: "coffee", benefitKind: "discount", reward: { kind: "percent", basisPoints: 500, rounding: "floor" }, performance: { kind: "previous_month", scopeKey: "spend" }, conditions: [{ kind: "channel", values: ["online"] }, { kind: "installment", maxMonths: 1 }, { kind: "minimum_amount", amount: 1000 }], recognitionBasis: "gross", quotaKeys: ["cafe", "family"], transactionLimit: 5000 }],
  cancellation: { kind: "verified_original_month_net_replay" },
};

describe("bounded card policies", () => {
  it("accepts rate rewards, tier-specific caps and independently shared quotas", () => {
    const policy = cardPolicySchema.parse(examplePolicy);
    expect(policy.benefits[0].reward).toEqual({ kind: "percent", basisPoints: 500, rounding: "floor" });
    expect(policy.quotas[0].limit).toEqual({ kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "base", amount: 10000 }, { tierKey: "plus", amount: 20000 }] });
  });
  it("expresses explicit no-requirement and fixed rewards without inventing zero tiers", () => {
    const input = structuredClone(examplePolicy);
    const policy = cardPolicySchema.parse({ ...input, performanceScopes: [], quotas: [], benefits: [{ ...input.benefits[0], performance: { kind: "none" }, reward: { kind: "fixed", amount: 2000 }, quotaKeys: [] }] });
    expect(policy.benefits[0].performance).toEqual({ kind: "none" });
    expect(policy.benefits[0].reward).toEqual({ kind: "fixed", amount: 2000 });
  });
  it.each([
    { ...examplePolicy, javascript: "return 0" },
    { ...examplePolicy, benefits: [{ ...examplePolicy.benefits[0], reward: { kind: "expression", code: "amount * .1" } }] },
    { ...examplePolicy, benefits: [{ ...examplePolicy.benefits[0], reward: { kind: "fixed", amount: 1, hidden: true } }] },
    { ...examplePolicy, benefits: [{ ...examplePolicy.benefits[0], conditions: [{ kind: "channel", values: ["online"], negate: true }] }] },
    { ...examplePolicy, cancellation: { ...examplePolicy.cancellation, code: "x" } },
  ])("rejects unknown fields and executable conditions", (policy) => {
    expect(cardPolicySchema.safeParse(policy).success).toBe(false);
  });
  it("rejects dangling quota, scope and tier references", () => {
    expect(cardPolicySchema.safeParse({ ...examplePolicy, quotas: [] }).success).toBe(false);
    expect(cardPolicySchema.safeParse({ ...examplePolicy, performanceScopes: [] }).success).toBe(false);
    expect(cardPolicySchema.safeParse({ ...examplePolicy, quotas: [{ ...examplePolicy.quotas[0], limit: { kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "missing", amount: 10 }] } }, examplePolicy.quotas[1]] }).success).toBe(false);
  });
  it("rejects duplicate keys, ambiguous tier ordering and incomplete tier caps", () => {
    expect(cardPolicySchema.safeParse({ ...examplePolicy, benefits: [examplePolicy.benefits[0], examplePolicy.benefits[0]] }).success).toBe(false);
    const scope = examplePolicy.performanceScopes[0];
    expect(cardPolicySchema.safeParse({ ...examplePolicy, performanceScopes: [{ ...scope, tiers: [...scope.tiers].reverse() }] }).success).toBe(false);
    expect(cardPolicySchema.safeParse({ ...examplePolicy, quotas: [{ ...examplePolicy.quotas[0], limit: { kind: "tiered", scopeKey: "spend", amounts: [{ tierKey: "base", amount: 10 }] } }, examplePolicy.quotas[1]] }).success).toBe(false);
  });
});

describe("cancellation verification and execution support", () => {
  it("keeps a verified purchase rule usable when only cancellation terms are unknown", () => {
    const policy = cardPolicySchema.parse({ ...examplePolicy, cancellation: { kind: "unknown" } });
    expect(policy.cancellation).toEqual({ kind: "unknown" });
    expect(policy.benefits[0].reward).toEqual({ kind: "percent", basisPoints: 500, rounding: "floor" });
  });
  it("represents the supported verified original-month net replay without configurable alternatives", () => {
    expect(cardPolicySchema.parse(examplePolicy).cancellation).toEqual({ kind: "verified_original_month_net_replay" });
  });
  it("retains verified proportional/refund-month terms only as unsupported descriptive data", () => {
    const policy = cardPolicySchema.parse({ ...examplePolicy, cancellation: {
      kind: "verified_unsupported",
      description: "Refund-month performance deduction and proportional benefit recovery; no quota restoration.",
      recordedPolicy: { performanceMonth: "refund", benefitRecovery: "proportional", quotaRestore: "none" },
    } });
    expect(policy.cancellation).toEqual({
      kind: "verified_unsupported",
      description: "Refund-month performance deduction and proportional benefit recovery; no quota restoration.",
      recordedPolicy: { performanceMonth: "refund", benefitRecovery: "proportional", quotaRestore: "none" },
    });
  });
  it("can describe verified unsupported terms outside the old enums without an executable expression", () => {
    expect(cardPolicySchema.parse({ ...examplePolicy, cancellation: {
      kind: "verified_unsupported", description: "Issuer-specific annual settlement adjustment.",
    } }).cancellation).toEqual({ kind: "verified_unsupported", description: "Issuer-specific annual settlement adjustment." });
  });
  it.each([
    ["missing cancellation", undefined],
    ["null rather than explicit unknown", null],
    ["untagged formerly accepted original policy", { performanceMonth: "original", benefitRecovery: "replay_original", quotaRestore: "original_month" }],
    ["untagged proportional refund policy", { performanceMonth: "refund", benefitRecovery: "proportional", quotaRestore: "none" }],
    ["unknown with a fabricated recovery default", { kind: "unknown", benefitRecovery: "proportional" }],
    ["supported tag with a different month", { kind: "verified_original_month_net_replay", performanceMonth: "refund" }],
    ["supported tag with proportional recovery", { kind: "verified_original_month_net_replay", benefitRecovery: "proportional" }],
    ["supported tag without original-month quota reallocation", { kind: "verified_original_month_net_replay", quotaRestore: "none" }],
    ["unsupported without a description", { kind: "verified_unsupported" }],
    ["unsupported with blank description", { kind: "verified_unsupported", description: "  " }],
    ["unsupported with an executable field", { kind: "verified_unsupported", description: "Proportional", code: "amount * .5" }],
    ["unsupported with an unknown recorded field", { kind: "verified_unsupported", description: "Proportional", recordedPolicy: { performanceMonth: "refund", benefitRecovery: "proportional", quotaRestore: "none", execute: true } }],
    ["unsupported with an invented recorded enum", { kind: "verified_unsupported", description: "Other", recordedPolicy: { performanceMonth: "future", benefitRecovery: "proportional", quotaRestore: "none" } }],
  ])("rejects %s rather than treating it as supported", (_description, cancellation) => {
    expect(cardPolicySchema.safeParse({ ...examplePolicy, cancellation }).success).toBe(false);
  });
});

describe("explicit replay policy terms", () => {
  const policy = {
    ...examplePolicy,
    performanceScopes: [{ ...examplePolicy.performanceScopes[0], benefitExclusions: ["coffee"] }],
    quotas: [{ ...examplePolicy.quotas[1], period: "daily", consumption: { kind: "count" } }],
    benefits: [{ ...examplePolicy.benefits[0], quotaKeys: ["family"], unit: { kind: "points", program: "synthetic" },
      benefitKind: "points", reward: { kind: "rate", numerator: 1, denominator: 1000, roundingUnit: 10 },
      performance: { kind: "current_month", scopeKey: "spend", timing: "before_transaction" },
      combination: { kind: "exclusive", group: "choice", selection: "priority", priority: 1 } }],
  };
  it("accepts explicit quota consumption, reward program, ordering and benefit exclusions", () => {
    expect(cardPolicySchema.safeParse(policy).success).toBe(true);
  });
  it("requires positive rounding/divisor, known exclusion targets and compatible quota units", () => {
    expect(cardPolicySchema.safeParse({ ...policy, benefits: [{ ...policy.benefits[0], reward: { kind: "rate", numerator: 1, denominator: 0, roundingUnit: 1 } }] }).success).toBe(false);
    expect(cardPolicySchema.safeParse({ ...policy, performanceScopes: [{ ...policy.performanceScopes[0], benefitExclusions: ["missing"] }] }).success).toBe(false);
    expect(cardPolicySchema.safeParse({ ...policy, quotas: [{ ...policy.quotas[0], consumption: { kind: "benefit_amount", unit: { kind: "won" } } }] }).success).toBe(false);
  });
  it("requires symmetric explicit stacking and a single selection contract per exclusive group", () => {
    const first = { ...examplePolicy.benefits[0], performance: { kind: "none" }, quotaKeys: [], combination: { kind: "stack", with: ["extra"], priority: 1 } };
    const second = { ...first, key: "extra", combination: { kind: "stack", with: ["coffee"], priority: 2 } };
    expect(cardPolicySchema.safeParse({ ...examplePolicy, benefits: [first, second] }).success).toBe(true);
    expect(cardPolicySchema.safeParse({ ...examplePolicy, benefits: [first, { ...second, combination: { ...second.combination, with: [] } }] }).success).toBe(false);
    expect(cardPolicySchema.safeParse({ ...policy, benefits: [policy.benefits[0], { ...policy.benefits[0], key: "extra", combination: { kind: "exclusive", group: "choice", selection: "maximum", priority: 2 } }] }).success).toBe(false);
  });
});

describe("new won amounts", () => {
  it.each([-1, 0.01, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "1000"])("rejects unsafe or coerced input %s", (amount) => {
    expect(wonAmountSchema.safeParse(amount).success).toBe(false);
  });
  it("accepts confirmed zero and the largest safe integer", () => {
    expect(wonAmountSchema.parse(0)).toBe(0);
    expect(wonAmountSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991);
  });
});
