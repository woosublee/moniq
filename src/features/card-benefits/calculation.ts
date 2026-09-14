import type { UserCardRecord } from "@/features/cards/types";
import { decimalRate, floorRate, readIntegerAmount } from "./money";
import { capBenefit } from "./quotas";
import { getPerformanceExclusionReason } from "@/features/card-benefits/performance";
import {
  matchBenefitRules,
  toMoneyNumber,
} from "@/features/card-benefits/rule-matching";
import type {
  BenefitCalculationContext,
  BenefitCalculationInput,
  BenefitCalculationResult,
  CardBenefitRuleRecord,
  CardPerformanceRequirementRecord,
  CardPerformanceSummary,
  PerformanceSummaryTransaction,
} from "@/features/card-benefits/types";

export function calculatePolicyReward(amount: number, reward: import("./policy-schema").CardPolicy["benefits"][number]["reward"]): number {
  if (reward.kind === "fixed") return reward.amount;
  return reward.kind === "percent"
    ? floorRate(amount, reward.basisPoints, 10000, reward.roundingUnit ?? 1)
    : floorRate(amount, reward.numerator, reward.denominator, reward.roundingUnit);
}

export type PolicyBenefitCandidate = { result: import("./engine-types").ReplayBenefit; eligibleSpend: number | null };

/** Pure transaction decision shared by replay; quota mutation stays in the monthly orchestrator. */
export function calculatePolicyBenefit(
  benefit: import("./engine-types").PolicyBenefit,
  base: import("./engine-types").ReplayAmount,
  match: import("./rule-matching").PolicyMatch,
  eligibility: import("./rule-matching").PolicyMatch,
  pools: readonly import("./engine-types").ReplayQuotaSummary[],
): PolicyBenefitCandidate {
  const unit = benefit.unit ?? (benefit.benefitKind === "points" ? null : { kind: "won" as const });
  let why = [...new Set([...base.reasons, ...match.reasons, ...eligibility.reasons])];
  let status: import("./engine-types").ReplayBenefit["status"] = "calculated";
  let spend = base.amount;
  let amount: number | null;
  const blocked = match.matches === false || eligibility.matches === false || base.amount === 0;
  if (blocked) {
    amount = 0; spend = 0; why = [];
    status = match.matches === false || base.amount === 0 ? "not_applicable" : "unmet";
  } else {
    if (match.matches === null || eligibility.matches === null) spend = null;
    const knownSpendCaps = pools.filter((pool) => pool.consumption === "eligible_spend" && pool.remaining !== null).map((pool) => pool.remaining!);
    if (spend !== null) spend = Math.min(spend, ...knownSpendCaps);
    if (pools.some((pool) => pool.remaining === 0) || benefit.transactionLimit === 0) amount = 0;
    else if (!unit) { amount = null; why.push("unit_unknown"); }
    else if (spend === null) amount = null;
    else {
      try { amount = spend === 0 || (benefit.reward.kind === "fixed" && spend !== base.amount) ? 0 : calculatePolicyReward(spend, benefit.reward); }
      catch { amount = null; why.push("precision_unknown"); }
      if (amount !== null) amount = capBenefit(amount, benefit.transactionLimit, null);
    }
    if (amount !== 0) {
      for (const pool of pools) {
        if (pool.remaining === null) { amount = null; why.push(...pool.reasons, "quota_unknown"); }
        else if (amount !== null && pool.consumption === "benefit_amount") amount = capBenefit(amount, null, pool.remaining);
      }
    }
  }
  return { eligibleSpend: spend, result: {
    key: benefit.key, benefitKind: benefit.benefitKind, unit, automaticAmount: amount, appliedAmount: amount,
    estimatedOverride: null, confirmedBenefit: null, appliedSource: "auto", status: amount === null ? "unknown" : status,
    reasons: [...new Set(why)].sort(), quotaConsumptions: [],
  } };
}

export const calculateBenefitAmount = (
  input: BenefitCalculationInput,
  rule: CardBenefitRuleRecord,
) => {
  const actualAmount = toMoneyNumber(input.actualAmount);

  if (rule.calculation_method === "fixed_amount") {
    return toMoneyNumber(rule.fixed_amount);
  }

  const ratio = decimalRate(rule.rate);
  if (ratio && readIntegerAmount(actualAmount) !== null) {
    return calculatePolicyReward(actualAmount, { kind: "rate", ...ratio, roundingUnit: 1 });
  }
  // Legacy UI compatibility only; replay never coerces unsupported precision.
  return Math.floor(actualAmount * toMoneyNumber(rule.rate));
};

export const applyBenefitCap = (
  rawBenefitAmount: number,
  rule: CardBenefitRuleRecord,
  monthlyRuleUsage: Map<string, number>,
) => {
  const cap = rule.max_benefit_amount === null ? null : toMoneyNumber(rule.max_benefit_amount);
  const perTransaction = rule.cap_period === "transaction" ? cap : null;
  const remaining = rule.cap_period === "monthly" && cap !== null ? Math.max(0, cap - (monthlyRuleUsage.get(rule.id) ?? 0)) : null;
  // Preserve legacy fractional UI values; strict replay calls capBenefit directly.
  if ([rawBenefitAmount, perTransaction, remaining].some((value) => value !== null && readIntegerAmount(value) === null)) {
    return Math.max(0, Math.min(rawBenefitAmount, perTransaction ?? rawBenefitAmount, remaining ?? rawBenefitAmount));
  }
  return capBenefit(rawBenefitAmount, perTransaction, remaining);
};

export const selectBestBenefit = (
  input: BenefitCalculationInput,
  rules: CardBenefitRuleRecord[],
  monthlyRuleUsage: Map<string, number>,
) => {
  const candidates = matchBenefitRules(input, rules).map((rule) => {
    const rawBenefitAmount = calculateBenefitAmount(input, rule);
    const benefitAmount = applyBenefitCap(rawBenefitAmount, rule, monthlyRuleUsage);

    return { rule, benefitAmount };
  });

  return candidates.sort((a, b) => b.benefitAmount - a.benefitAmount || a.rule.priority - b.rule.priority)[0] ?? null;
};

export const calculateTransactionBenefit = (
  input: BenefitCalculationInput,
  context: BenefitCalculationContext,
): BenefitCalculationResult => {
  const actualAmount = toMoneyNumber(input.actualAmount);
  const manualBenefitAmount = toMoneyNumber(input.benefitAmount);
  const hasManualBenefitInput = manualBenefitAmount > 0 || Boolean(input.benefitLabel.trim());
  const isUnsupportedCard =
    !context.userCard || context.userCard.card.benefit_support_status === "none";
  const availableRules = context.rules.filter(
    (rule) => !rule.requires_performance || context.isPerformanceRequirementMet,
  );
  const bestBenefit = isUnsupportedCard
    ? null
    : selectBestBenefit(input, availableRules, context.monthlyRuleUsage);

  if (bestBenefit && bestBenefit.benefitAmount > 0) {
    const performanceExclusionReason = getPerformanceExclusionReason({
      input,
      rules: context.performanceExclusionRules,
      benefitApplied: true,
    });
    const isPerformanceEligible = !performanceExclusionReason && input.isPerformanceEligible;
    const reducesFinalAmount =
      bestBenefit.rule.benefit_kind === "discount" ||
      bestBenefit.rule.benefit_kind === "statement_credit";
    const finalAmount = reducesFinalAmount
      ? Math.max(actualAmount - bestBenefit.benefitAmount, 0)
      : actualAmount;

    return {
      source: "auto",
      rule: bestBenefit.rule,
      label: bestBenefit.rule.name,
      benefitAmount: bestBenefit.benefitAmount,
      finalAmount,
      eligibleSpendAmount: isPerformanceEligible ? finalAmount : 0,
      isPerformanceEligible,
      performanceExclusionReason,
      calculationStatus: "calculated",
      calculationSnapshot: {
        ruleId: bestBenefit.rule.id,
        ruleName: bestBenefit.rule.name,
        benefitKind: bestBenefit.rule.benefit_kind,
        calculationMethod: bestBenefit.rule.calculation_method,
        rate: bestBenefit.rule.rate,
        fixedAmount: bestBenefit.rule.fixed_amount,
        benefitAmount: bestBenefit.benefitAmount,
        finalAmount,
        eligibleSpendAmount: isPerformanceEligible ? finalAmount : 0,
        requiresPerformance: bestBenefit.rule.requires_performance,
        isPerformanceRequirementMet: context.isPerformanceRequirementMet,
        performanceExclusionReason,
      },
    };
  }

  const finalAmount = Math.max(toMoneyNumber(input.finalAmount), 0);
  const performanceExclusionReason = getPerformanceExclusionReason({
    input,
    rules: context.performanceExclusionRules,
    benefitApplied: manualBenefitAmount > 0,
  });
  const isPerformanceEligible = !performanceExclusionReason && input.isPerformanceEligible;

  return {
    source: "manual",
    rule: null,
    label: input.benefitLabel || null,
    benefitAmount: manualBenefitAmount,
    finalAmount,
    eligibleSpendAmount: isPerformanceEligible ? finalAmount : 0,
    isPerformanceEligible,
    performanceExclusionReason,
    calculationStatus: hasManualBenefitInput
      ? "manual_override"
      : isUnsupportedCard
        ? "unsupported_card"
        : "no_matching_rule",
    calculationSnapshot: manualBenefitAmount > 0
      ? {
          source: "manual_transaction_fields",
          ruleName: input.benefitLabel || null,
          benefitAmount: manualBenefitAmount,
          finalAmount,
          eligibleSpendAmount: isPerformanceEligible ? finalAmount : 0,
          performanceExclusionReason,
        }
      : {
          benefitAmount: manualBenefitAmount,
          finalAmount,
          eligibleSpendAmount: isPerformanceEligible ? finalAmount : 0,
          performanceExclusionReason,
        },
  };
};

export const calculateCardPerformanceSummary = ({
  userCard,
  transactions,
  requirement,
}: {
  userCard: UserCardRecord;
  transactions: PerformanceSummaryTransaction[];
  requirement: CardPerformanceRequirementRecord | null;
}): CardPerformanceSummary => {
  const eligibleSpendAmount = transactions
    .filter((transaction) => transaction.user_card_id === userCard.id)
    .reduce((total, transaction) => total + toMoneyNumber(transaction.eligible_spend_amount), 0);
  const benefitAmount = transactions
    .filter((transaction) => transaction.user_card_id === userCard.id)
    .reduce((total, transaction) => total + toMoneyNumber(transaction.benefit_amount), 0);
  const requiredSpendAmount = requirement ? toMoneyNumber(requirement.required_spend_amount) : 0;
  const remainingSpendAmount = Math.max(requiredSpendAmount - eligibleSpendAmount, 0);

  return {
    userCard,
    requirement,
    eligibleSpendAmount,
    requiredSpendAmount,
    remainingSpendAmount,
    benefitAmount,
    status: requirement ? (remainingSpendAmount === 0 ? "met" : "unmet") : "no_requirement",
  };
};
