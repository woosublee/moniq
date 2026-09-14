import { z } from "zod";

export const benefitKindSchema = z.enum(["discount", "cashback", "points", "statement_credit"]);
export const benefitCalculationMethodSchema = z.enum(["percent", "fixed_amount"]);
export const benefitCapPeriodSchema = z.enum(["transaction", "monthly", "none"]);
export const performancePeriodTypeSchema = z.enum(["calendar_month"]);

export const cardBenefitRuleSchema = z.object({
  cardId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  benefitKind: benefitKindSchema,
  calculationMethod: benefitCalculationMethodSchema,
  rate: z.number().min(0).nullable(),
  fixedAmount: z.number().min(0).nullable(),
  minPaymentAmount: z.number().min(0),
  maxBenefitAmount: z.number().min(0).nullable(),
  capPeriod: benefitCapPeriodSchema,
  matchMerchantKeywords: z.array(z.string().trim().min(1)).default([]),
  matchLedgerCategories: z.array(z.string().trim().min(1)).default([]),
  excludeMerchantKeywords: z.array(z.string().trim().min(1)).default([]),
  excludeLedgerCategories: z.array(z.string().trim().min(1)).default([]),
  requiresPerformance: z.boolean(),
  priority: z.number().int(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  isActive: z.boolean(),
});

export const cardPerformanceRequirementSchema = z.object({
  cardId: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  requiredSpendAmount: z.number().min(0),
  periodType: performancePeriodTypeSchema,
  benefitPeriodOffsetMonths: z.number().int(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  isActive: z.boolean(),
});
