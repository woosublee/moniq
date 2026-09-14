import type {
  BenefitCalculationInput,
  CardBenefitRuleRecord,
} from "@/features/card-benefits/types";

export const toMoneyNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const includesAnyKeyword = (value: string, keywords: string[]) => {
  const normalizedValue = normalize(value);

  return keywords.some((keyword) => normalizedValue.includes(normalize(keyword)));
};

const matchesList = (value: string | null | undefined, targets: string[]) => {
  if (targets.length === 0) {
    return true;
  }

  const normalizedValue = normalize(value);

  return targets.some((target) => normalizedValue === normalize(target));
};

const isRuleActive = (rule: CardBenefitRuleRecord, occurredAt: string) => {
  const occurredDate = occurredAt.slice(0, 10);

  return (
    rule.is_active &&
    (!rule.starts_on || occurredDate >= rule.starts_on) &&
    (!rule.ends_on || occurredDate <= rule.ends_on)
  );
};

const isRuleMatched = (input: BenefitCalculationInput, rule: CardBenefitRuleRecord) => {
  if (!isRuleActive(rule, input.occurredAt)) {
    return false;
  }

  if (toMoneyNumber(input.actualAmount) < toMoneyNumber(rule.min_payment_amount)) {
    return false;
  }

  if (
    rule.match_merchant_keywords.length > 0 &&
    !includesAnyKeyword(input.merchantName, rule.match_merchant_keywords)
  ) {
    return false;
  }

  if (!matchesList(input.ledgerCategory, rule.match_ledger_categories)) {
    return false;
  }

  if (
    rule.exclude_merchant_keywords.length > 0 &&
    includesAnyKeyword(input.merchantName, rule.exclude_merchant_keywords)
  ) {
    return false;
  }

  if (
    input.ledgerCategory &&
    rule.exclude_ledger_categories.some((category) => normalize(category) === normalize(input.ledgerCategory))
  ) {
    return false;
  }

  return true;
};

export type PolicyMatchInput = {
  merchant: import("./engine-types").MerchantMatch;
  category: string | null;
  channel: import("./policy-schema").PaymentChannel;
  installmentMonths: number | null;
  amount: number | null;
};
export type PolicyMatch = { matches: boolean | null; reasons: import("./engine-types").ReplayReason[] };

/** The same exact-list normalization as legacy matching, with explicit missing facts. */
export function matchPolicyCondition(condition: import("./policy-schema").PolicyCondition, input: PolicyMatchInput): PolicyMatch {
  const yes = (matches: boolean): PolicyMatch => ({ matches, reasons: [] });
  switch (condition.kind) {
    case "merchant":
      if (input.merchant.status === "ambiguous") return { matches: null, reasons: ["merchant_ambiguous"] };
      if (matchesList(input.merchant.normalizedName, condition.values)) return yes(true);
      return input.merchant.status === "exact" ? yes(false) : { matches: null, reasons: ["merchant_unknown"] };
    case "category": return input.category ? yes(matchesList(input.category, condition.values)) : { matches: null, reasons: ["category_unknown"] };
    case "channel": return input.channel === "unknown" ? { matches: null, reasons: ["channel_unknown"] } : yes(condition.values.includes(input.channel));
    case "installment": return input.installmentMonths === null ? { matches: null, reasons: ["installment_unknown"] } : yes(input.installmentMonths <= condition.maxMonths);
    case "minimum_amount": return input.amount === null ? { matches: null, reasons: ["precision_unknown"] } : yes(input.amount >= condition.amount);
  }
}
export function matchPolicyConditions(conditions: readonly import("./policy-schema").PolicyCondition[], input: PolicyMatchInput): PolicyMatch {
  const matched = conditions.map((condition) => matchPolicyCondition(condition, input));
  if (matched.some((entry) => entry.matches === false)) return { matches: false, reasons: [] };
  return { matches: matched.some((entry) => entry.matches === null) ? null : true, reasons: [...new Set(matched.flatMap((entry) => entry.reasons))].sort() };
}

export const matchBenefitRules = (
  input: BenefitCalculationInput,
  rules: CardBenefitRuleRecord[],
) => rules.filter((rule) => isRuleMatched(input, rule)).sort((a, b) => a.priority - b.priority);
