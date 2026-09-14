import type {
  BenefitCalculationInput,
  CardPerformanceExclusionRuleRecord,
} from "@/features/card-benefits/types";

import { matchPolicyCondition, type PolicyMatchInput } from "./rule-matching";
import type { PolicyScope, ReplayAmount, ReplayBenefit, ReplayReason } from "./engine-types";
import { knownAmount, reasons, sumAmounts, unknownAmount } from "./summaries";

/** Only final applied won discounts/statement credits reduce recognized paid spend. */
export function finalPaidAmount(principal: ReplayAmount, benefits: readonly ReplayBenefit[]): ReplayAmount {
  const reductions = sumAmounts(benefits.filter((benefit) => benefit.unit?.kind === "won" && (benefit.benefitKind === "discount" || benefit.benefitKind === "statement_credit"))
    .map((benefit) => ({ amount: benefit.appliedAmount, reasons: benefit.appliedAmount === null ? benefit.reasons : [] })));
  if (principal.amount === null || reductions.amount === null) return { amount: null, reasons: reasons(principal.reasons, reductions.reasons) };
  return knownAmount(Math.max(0, principal.amount - reductions.amount));
}
export function calculateScopeRecognition(scope: PolicyScope, input: PolicyMatchInput, excluded: boolean, principal: ReplayAmount, benefits: readonly ReplayBenefit[], benefitsKnown = true): ReplayAmount {
  if (excluded) return knownAmount(0);
  const matches = scope.exclusions.map((condition) => matchPolicyCondition(condition, input));
  if (matches.some((match) => match.matches === true)) return knownAmount(0);
  const excludedBenefits = (scope.benefitExclusions ?? []).map((key) => benefits.find((benefit) => benefit.key === key));
  if (excludedBenefits.some((benefit) => benefit?.appliedAmount !== null && (benefit?.appliedAmount ?? 0) > 0)) return knownAmount(0);
  if (matches.some((match) => match.matches === null)) return unknownAmount(...matches.flatMap((match) => match.reasons));
  if (!benefitsKnown && (scope.basis === "net_paid" || excludedBenefits.length > 0)) return unknownAmount("policy_unverified");
  if (excludedBenefits.some((benefit) => benefit?.appliedAmount === null)) return unknownAmount(...excludedBenefits.flatMap((benefit): ReplayReason[] => benefit?.reasons ?? []));
  return scope.basis === "gross" ? principal : finalPaidAmount(principal, benefits);
}

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const includesAnyKeyword = (value: string, keywords: string[]) => {
  const normalizedValue = normalize(value);

  return keywords.some((keyword) => normalizedValue.includes(normalize(keyword)));
};

const matchesCategory = (value: string | null | undefined, categories: string[]) => {
  if (categories.length === 0) {
    return true;
  }

  return categories.some((category) => normalize(category) === normalize(value));
};

const isRuleActive = (rule: CardPerformanceExclusionRuleRecord, occurredAt: string) => {
  const occurredDate = occurredAt.slice(0, 10);

  return (
    rule.is_active &&
    (!rule.starts_on || occurredDate >= rule.starts_on) &&
    (!rule.ends_on || occurredDate <= rule.ends_on)
  );
};

export function getPerformanceExclusionReason({
  input,
  rules,
  benefitApplied,
}: {
  input: BenefitCalculationInput;
  rules: CardPerformanceExclusionRuleRecord[];
  benefitApplied: boolean;
}) {
  const matchedRule = rules
    .filter((rule) => isRuleActive(rule, input.occurredAt))
    .sort((a, b) => a.priority - b.priority)
    .find((rule) => {
      if (rule.exclude_if_benefit_applied && !benefitApplied) {
        return false;
      }

      if (
        rule.match_merchant_keywords.length > 0 &&
        !includesAnyKeyword(input.merchantName, rule.match_merchant_keywords)
      ) {
        return false;
      }

      return matchesCategory(input.ledgerCategory, rule.match_ledger_categories);
    });

  return matchedRule?.label ?? null;
}
