import { z } from "zod";

/** New KRW only. Legacy numeric strings must never pass through coercion. */
export const wonAmountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const policyKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const keys = z.array(policyKeySchema).max(64).refine(unique, "Duplicate key");
const slots = keys.refine((values) => values.length > 0 && values.includes("self"), "Contributors must include self");
const values = z.array(z.string().min(1).max(120)).min(1).max(64).refine(unique);
export const paymentChannelSchema = z.enum(["offline", "online", "mobile_wallet", "unknown"]);
export const recognitionBasisSchema = z.enum(["gross", "net_paid"]);

// Conditions are ANDed; values inside a condition are ORed. Exclusions are ORed.
// No recursive expressions, negation, user scripts, or implicit unsupported conditions.
export const policyConditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("merchant"), values }),
  z.strictObject({ kind: z.literal("category"), values }),
  z.strictObject({ kind: z.literal("channel"), values: z.array(paymentChannelSchema).min(1).max(4).refine(unique) }),
  z.strictObject({ kind: z.literal("installment"), maxMonths: z.number().int().min(1).max(60) }),
  z.strictObject({ kind: z.literal("minimum_amount"), amount: wonAmountSchema }),
]);
export const rewardUnitSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("won") }),
  z.strictObject({ kind: z.literal("points"), program: policyKeySchema }),
  z.strictObject({ kind: z.literal("miles"), program: policyKeySchema }),
]);
const positiveInteger = wonAmountSchema.refine((value) => value > 0);
export const performanceScopeSchema = z.strictObject({
  key: policyKeySchema,
  contributorSlots: slots,
  basis: recognitionBasisSchema,
  exclusions: z.array(policyConditionSchema).max(64),
  // Exclude a purchase once when any named FINAL applied benefit is positive.
  benefitExclusions: keys.optional(),
  tiers: z.array(z.strictObject({ key: policyKeySchema, minimumSpend: wonAmountSchema })).min(1).max(32),
}).superRefine((scope, ctx) => {
  if (!unique(scope.tiers.map((tier) => tier.key)) || scope.tiers.some((tier, i) => i > 0 && tier.minimumSpend <= scope.tiers[i - 1].minimumSpend)) {
    ctx.addIssue({ code: "custom", path: ["tiers"], message: "Unique tiers must be strictly ascending" });
  }
});
export const rewardSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("percent"), basisPoints: z.number().int().min(0).max(10000), rounding: z.literal("floor"), roundingUnit: positiveInteger.optional() }),
  z.strictObject({ kind: z.literal("fixed"), amount: wonAmountSchema }),
  z.strictObject({ kind: z.literal("rate"), numerator: wonAmountSchema, denominator: positiveInteger, roundingUnit: positiveInteger }),
]);
export const performanceBasisSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("previous_month"), scopeKey: policyKeySchema }),
  z.strictObject({ kind: z.literal("current_month"), scopeKey: policyKeySchema, timing: z.enum(["before_transaction", "including_transaction", "month_end"]) }),
]);
export const quotaSchema = z.strictObject({
  key: policyKeySchema,
  // Absent fields preserve v1 monthly benefit-amount semantics, NOT unknown point units.
  period: z.enum(["daily", "monthly"]).optional(),
  consumption: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("benefit_amount"), unit: rewardUnitSchema }),
    z.strictObject({ kind: z.literal("eligible_spend") }),
    z.strictObject({ kind: z.literal("count") }),
  ]).optional(),
  sharing: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("independent") }),
    z.strictObject({ kind: z.literal("shared"), contributorSlots: slots }),
  ]),
  limit: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("fixed"), amount: wonAmountSchema }),
    z.strictObject({ kind: z.literal("tiered"), scopeKey: policyKeySchema, amounts: z.array(z.strictObject({ tierKey: policyKeySchema, amount: wonAmountSchema })).min(1).max(32) }),
  ]),
});
/** One v1 default for validation, pool identity and replay; never infer a points program. */
export function normalizedQuotaConsumption(quota: z.infer<typeof quotaSchema>): NonNullable<z.infer<typeof quotaSchema>["consumption"]> {
  return quota.consumption ?? { kind: "benefit_amount", unit: { kind: "won" } };
}

/** Only verified_original_month_net_replay is executable by the planned replay engine:
 * recompute the original month's net purchases and reallocate that month's quotas.
 * Unknown terms never inherit a default. verified_unsupported records checked terms
 * for explanation only; recordedPolicy must NEVER be dispatched as executable policy.
 */
export const cancellationPolicySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unknown") }),
  z.strictObject({
    kind: z.literal("verified_unsupported"),
    description: z.string().trim().min(1).max(1000),
    recordedPolicy: z.strictObject({
      performanceMonth: z.enum(["original", "refund"]),
      benefitRecovery: z.enum(["proportional", "replay_original"]),
      quotaRestore: z.enum(["original_month", "none"]),
    }).optional(),
  }),
  z.strictObject({ kind: z.literal("verified_original_month_net_replay") }),
]);

export const cardPolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  performanceScopes: z.array(performanceScopeSchema).max(64),
  quotas: z.array(quotaSchema).max(64),
  benefits: z.array(z.strictObject({
    key: policyKeySchema,
    benefitKind: z.enum(["discount", "cashback", "points", "statement_credit"]),
    unit: rewardUnitSchema.optional(),
    combination: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("exclusive"), group: policyKeySchema, selection: z.enum(["priority", "maximum"]), priority: wonAmountSchema }),
      z.strictObject({ kind: z.literal("stack"), with: keys, priority: wonAmountSchema }),
    ]).optional(),
    reward: rewardSchema,
    performance: performanceBasisSchema,
    conditions: z.array(policyConditionSchema).max(64),
    recognitionBasis: recognitionBasisSchema,
    quotaKeys: keys,
    transactionLimit: wonAmountSchema.nullable(),
  })).max(64),
  cancellation: cancellationPolicySchema,
}).superRefine((policy, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  for (const name of ["performanceScopes", "quotas", "benefits"] as const) {
    if (!unique(policy[name].map((entry) => entry.key))) issue([name], "Duplicate key");
  }
  const scopes = new Map(policy.performanceScopes.map((scope) => [scope.key, scope]));
  const quotas = new Set(policy.quotas.map((quota) => quota.key));
  policy.benefits.forEach((benefit, index) => {
    if (benefit.performance.kind !== "none" && !scopes.has(benefit.performance.scopeKey)) issue(["benefits", index, "performance"], "Unknown performance scope");
    if (benefit.quotaKeys.some((key) => !quotas.has(key))) issue(["benefits", index, "quotaKeys"], "Unknown quota");
    if (benefit.unit && (benefit.benefitKind === "points") === (benefit.unit.kind === "won")) issue(["benefits", index, "unit"], "Reward unit must match benefit kind");
    for (const quota of policy.quotas.filter((quota) => benefit.quotaKeys.includes(quota.key))) {
      const consumption = normalizedQuotaConsumption(quota);
      const unit = benefit.unit ?? (benefit.benefitKind === "points" ? null : { kind: "won" });
      // Legacy unidentified points stay unit_unknown in replay, not silently won.
      if (consumption.kind === "benefit_amount" && (unit !== null || quota.consumption !== undefined) && JSON.stringify(consumption.unit) !== JSON.stringify(unit)) {
        issue(["benefits", index, "quotaKeys"], "Benefit-amount quota unit must match reward program");
      }
    }
    const combination = benefit.combination;
    if (combination?.kind === "stack") {
      for (const key of combination.with) {
        const other = policy.benefits.find((candidate) => candidate.key === key);
        if (key === benefit.key || other?.combination?.kind !== "stack" || !other.combination.with.includes(benefit.key) || other.combination.priority === combination.priority) {
          issue(["benefits", index, "combination"], "Stacking must be symmetric with distinct priorities");
        }
      }
    }
    if (combination?.kind === "exclusive" && policy.benefits.some((other) => other.key !== benefit.key && other.combination?.kind === "exclusive" && other.combination.group === combination.group && (other.combination.selection !== combination.selection || other.combination.priority === combination.priority))) {
      issue(["benefits", index, "combination"], "Exclusive groups need one selection contract and distinct priorities");
    }
  });
  policy.performanceScopes.forEach((scope, index) => {
    if (scope.benefitExclusions?.some((key) => !policy.benefits.some((benefit) => benefit.key === key))) issue(["performanceScopes", index, "benefitExclusions"], "Unknown benefit exclusion target");
  });
  policy.quotas.forEach((quota, index) => {
    if (quota.limit.kind !== "tiered") return;
    const scope = scopes.get(quota.limit.scopeKey);
    const tierKeys = quota.limit.amounts.map((amount) => amount.tierKey);
    if (!scope || !unique(tierKeys) || tierKeys.length !== scope.tiers.length || scope.tiers.some((tier) => !tierKeys.includes(tier.key))) {
      issue(["quotas", index, "limit"], "Exactly one cap per referenced tier is required");
    }
  });
});

export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;
export type CardPolicy = z.infer<typeof cardPolicySchema>;
export type PolicyCondition = z.infer<typeof policyConditionSchema>;
export type PerformanceBasis = z.infer<typeof performanceBasisSchema>;
export type PaymentChannel = z.infer<typeof paymentChannelSchema>;
